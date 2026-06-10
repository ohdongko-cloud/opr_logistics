/**
 * JobStore (PRD §4.10 F10 / M5·M8)
 *
 *   DATABASE_URL 환경변수가 있으면 Neon Drizzle 백엔드 사용.
 *   없으면 인메모리(globalThis 싱글톤) 폴백 — 개발/테스트/CI 용.
 *
 *   Blob 백엔드는 raw-sheets + processed 를 하나의 JSON으로 묶어 저장한다.
 *   BLOB_READ_WRITE_TOKEN 환경변수가 없으면 인메모리 메모리 폴백(blob/storage.ts).
 */
import { eq, lte, sql as drizzleSql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { jobs as jobsTable } from "@/db/schema";
import {
  deleteBlob,
  getBlobAsJson,
  isBlobEnabled,
  putBlob,
} from "@/lib/blob/storage";
import type { ProcessedJob } from "@/lib/generate/process";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import type { RawStage } from "@/lib/parser/signatures";

const USE_DB =
  !!(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);

// ============================================================================
// 타입 (변경: M5와 동일하게 유지 — 호출 코드 호환)
// ============================================================================

export interface JobRecord {
  id: string;
  plnt: string;
  outletName: string;
  sourceFilenames: string[];
  detectedSheets: Record<RawStage, string | null>;
  processed: ProcessedJob;
  rawSheets: {
    stage1: ParsedSheet;
    stage2: ParsedSheet | null;
    stage3: ParsedSheet;
    stage4: ParsedSheet;
  };
  pgNumbers: Record<string, string>;
  headerOverrides: {
    docTitle?: string;
    deliveryDate?: string;
    footerLeft?: string;
  };
  etcAcknowledged: boolean;
  /** 잡 소유자 (M9: IDOR 차단) */
  createdByEmail: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateJobInput {
  plnt: string;
  outletName: string;
  sourceFilenames: string[];
  detectedSheets: Record<RawStage, string | null>;
  processed: ProcessedJob;
  rawSheets: JobRecord["rawSheets"];
  /** 인증된 사용자 이메일 (M9: IDOR 차단) */
  createdByEmail: string | null;
}

type JobPatch = Partial<
  Pick<JobRecord, "pgNumbers" | "headerOverrides" | "etcAcknowledged">
>;

// ============================================================================
// 인메모리 백엔드 (globalThis 싱글톤, HMR 안전)
// ============================================================================

const STORE_KEY = Symbol.for("opr-logistics.jobs.store.v1");
type G = typeof globalThis & { [k: symbol]: Map<string, JobRecord> | undefined };
const g = globalThis as G;
const memory: Map<string, JobRecord> =
  g[STORE_KEY] ?? new Map<string, JobRecord>();
if (!g[STORE_KEY]) g[STORE_KEY] = memory;

function newJobRecord(input: CreateJobInput): JobRecord {
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  return {
    id,
    plnt: input.plnt,
    outletName: input.outletName,
    sourceFilenames: input.sourceFilenames,
    detectedSheets: input.detectedSheets,
    processed: input.processed,
    rawSheets: input.rawSheets,
    pgNumbers: {},
    headerOverrides: {},
    etcAcknowledged: false,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    expiresAt,
  };
}

async function createJobMemory(input: CreateJobInput): Promise<JobRecord> {
  const rec = newJobRecord(input);
  memory.set(rec.id, rec);
  return rec;
}

async function getJobMemory(id: string): Promise<JobRecord | null> {
  return memory.get(id) ?? null;
}

async function updateJobMemory(
  id: string,
  patch: JobPatch
): Promise<JobRecord | null> {
  const rec = memory.get(id);
  if (!rec) return null;
  if (patch.pgNumbers) rec.pgNumbers = { ...rec.pgNumbers, ...patch.pgNumbers };
  if (patch.headerOverrides)
    rec.headerOverrides = { ...rec.headerOverrides, ...patch.headerOverrides };
  if (patch.etcAcknowledged !== undefined)
    rec.etcAcknowledged = patch.etcAcknowledged;
  return rec;
}

async function deleteExpiredMemory(
  now: Date
): Promise<{ deletedIds: string[]; deletedBlobs: string[] }> {
  const deletedIds: string[] = [];
  const deletedBlobs: string[] = [];
  for (const [id, rec] of memory) {
    if (rec.expiresAt.getTime() <= now.getTime()) {
      memory.delete(id);
      deletedIds.push(id);
    }
  }
  return { deletedIds, deletedBlobs };
}

// ============================================================================
// DB + Blob 백엔드
// ============================================================================

interface JobDataBlob {
  processed: ProcessedJob;
  rawSheets: JobRecord["rawSheets"];
}

/** Date 인스턴스를 ISO로 직렬화 한 뒤 재구성 */
function reviveProcessed(p: ProcessedJob): ProcessedJob {
  return {
    ...p,
    generatedAt: new Date(p.generatedAt),
  };
}

async function createJobDb(input: CreateJobInput): Promise<JobRecord> {
  const id = randomUUID();
  // 1) Blob 업로드 (또는 인메모리 폴백)
  const dataKey = `jobs/${id}/data.json`;
  const payload: JobDataBlob = {
    processed: input.processed,
    rawSheets: input.rawSheets,
  };
  const blob = await putBlob(dataKey, JSON.stringify(payload), {
    contentType: "application/json",
  });

  // 2) DB row 삽입 (M9: createdByEmail 채움 — IDOR 차단)
  const inserted = await db
    .insert(jobsTable)
    .values({
      id,
      plnt: input.plnt,
      status: "ready",
      sourceFilenames: input.sourceFilenames,
      blobKeys: [blob.key],
      pgNumbers: {},
      headerOverrides: {},
      createdByEmail: input.createdByEmail,
    })
    .returning();
  const row = inserted[0]!;

  return {
    id: row.id,
    plnt: row.plnt,
    outletName: input.outletName,
    sourceFilenames: row.sourceFilenames,
    detectedSheets: input.detectedSheets,
    processed: input.processed,
    rawSheets: input.rawSheets,
    pgNumbers: row.pgNumbers,
    headerOverrides: row.headerOverrides,
    etcAcknowledged: false, // M8: 별도 컬럼 추가 전엔 headerOverrides 안에 보관
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

async function getJobDb(id: string): Promise<JobRecord | null> {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Blob에서 데이터 로드
  const blobKey = row.blobKeys[0];
  if (!blobKey) return null;
  const data = await getBlobAsJson<JobDataBlob>(blobKey);
  if (!data) return null;

  // outletName 은 plants 테이블에서 lookup
  const { outletResolverAsync } = await import("./plants");
  const outletName = (await outletResolverAsync(row.plnt)) ?? "강서";

  const detectedSheets: Record<RawStage, string | null> = {
    stage1: data.rawSheets.stage1.name,
    stage2: data.rawSheets.stage2?.name ?? null,
    stage3: data.rawSheets.stage3.name,
    stage4: data.rawSheets.stage4.name,
  };

  return {
    id: row.id,
    plnt: row.plnt,
    outletName,
    sourceFilenames: row.sourceFilenames,
    detectedSheets,
    processed: reviveProcessed(data.processed),
    rawSheets: data.rawSheets,
    pgNumbers: row.pgNumbers,
    headerOverrides: row.headerOverrides,
    etcAcknowledged: !!row.headerOverrides._etcAck, // hack: 별도 컬럼 추가 전 임시 보관
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

/**
 * updateJobDb — M9 PATCH race condition 차단
 *
 * 기존: SELECT → JS merge → UPDATE (3 round-trip, lost update 위험)
 * 개선: Postgres jsonb || 연산자로 *DB 측에서* atomic merge.
 *   UPDATE jobs SET
 *     pg_numbers = pg_numbers || $1::jsonb,
 *     header_overrides = header_overrides || $2::jsonb
 *   WHERE id = $3
 * → 두 요청이 동시에 들어와도 마지막 쓰기가 이전 쓰기를 덮어쓰는 게 아니라 *추가*됨.
 *   (값이 같은 키면 last-write-wins, 다른 키면 둘 다 보존)
 */
async function updateJobDb(
  id: string,
  patch: JobPatch
): Promise<JobRecord | null> {
  // 빈 patch면 단순 select
  const hasUpdates =
    patch.pgNumbers !== undefined ||
    patch.headerOverrides !== undefined ||
    patch.etcAcknowledged !== undefined;
  if (!hasUpdates) return getJobDb(id);

  // header_overrides 머지에 _etcAck도 함께 포함
  const hoPatch: Record<string, string | undefined> = {
    ...(patch.headerOverrides ?? {}),
  };
  if (patch.etcAcknowledged !== undefined) {
    hoPatch._etcAck = patch.etcAcknowledged ? "1" : "";
  }

  const pgJson = JSON.stringify(patch.pgNumbers ?? {});
  const hoJson = JSON.stringify(hoPatch);
  const updated = await db
    .update(jobsTable)
    .set({
      pgNumbers: drizzleSql`${jobsTable.pgNumbers} || ${pgJson}::jsonb`,
      headerOverrides: drizzleSql`${jobsTable.headerOverrides} || ${hoJson}::jsonb`,
    })
    .where(eq(jobsTable.id, id))
    .returning({ id: jobsTable.id });
  if (updated.length === 0) return null;

  return getJobDb(id);
}

async function deleteExpiredDb(
  now: Date
): Promise<{ deletedIds: string[]; deletedBlobs: string[] }> {
  const expired = await db
    .select({ id: jobsTable.id, blobKeys: jobsTable.blobKeys })
    .from(jobsTable)
    .where(lte(jobsTable.expiresAt, now));
  const deletedBlobs: string[] = [];
  for (const r of expired) {
    for (const k of r.blobKeys ?? []) {
      try {
        await deleteBlob(k);
        deletedBlobs.push(k);
      } catch {
        // ignore
      }
    }
  }
  if (expired.length > 0) {
    await db.delete(jobsTable).where(lte(jobsTable.expiresAt, now));
  }
  return { deletedIds: expired.map((r) => r.id), deletedBlobs };
}

// ============================================================================
// Public API — 백엔드 분기
// ============================================================================

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  return USE_DB ? createJobDb(input) : createJobMemory(input);
}

export async function getJob(id: string): Promise<JobRecord | null> {
  return USE_DB ? getJobDb(id) : getJobMemory(id);
}

export async function updateJob(
  id: string,
  patch: JobPatch
): Promise<JobRecord | null> {
  return USE_DB ? updateJobDb(id, patch) : updateJobMemory(id, patch);
}

export async function deleteExpiredJobs(
  now: Date = new Date()
): Promise<{ deletedIds: string[]; deletedBlobs: string[] }> {
  return USE_DB ? deleteExpiredDb(now) : deleteExpiredMemory(now);
}

/** 운영 상태 확인용 (디버깅 / 헬스체크) */
export function storeMode(): "db" | "memory" {
  return USE_DB ? "db" : "memory";
}

/** Blob 모드 확인용 — getJob 후 raw-sheets가 실제 디스크인지 메모리인지 */
export function isJobBlobPersisted(): boolean {
  return isBlobEnabled();
}
