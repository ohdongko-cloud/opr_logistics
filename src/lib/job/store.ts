/**
 * JobStore — 단계형 워크플로우 (PRD #0002 §4.1 F1)
 *
 *   DATABASE_URL 있으면 Neon Drizzle + Vercel Blob, 없으면 인메모리(globalThis) 폴백.
 *
 * 단발성(#0001) → 점진적(#0002) 재설계:
 *   - STEP1 직후 부분 레코드 생성(stage1만, step=s1_uploaded, output1 계산)
 *   - stage2/3/4 누적, step CAS 전이
 *   - 출력1은 STEP1, 출력2·3은 STEP7(finalize)에서 계산
 *   - getJob은 부분 잡도 반환(404 안 냄)
 */
import { eq, lte, sql as dsql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { jobs as jobsTable } from "@/db/schema";
import { deleteBlob, getBlobAsJson, putBlob } from "@/lib/blob/storage";
import {
  processOutput1,
  processOutputs23,
  type Output1StepResult,
  type Outputs23Result,
} from "@/lib/generate/process";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { staticOutletResolver } from "./plants";
import {
  canTransition,
  invalidationFor,
  type JobStep,
} from "./transitions";

const USE_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);

// ============================================================================
// 타입
// ============================================================================

export interface JobStages {
  stage1: ParsedSheet | null;
  stage2: ParsedSheet | null;
  stage3: ParsedSheet | null;
  stage4: ParsedSheet | null;
}

/** Blob에 저장되는 잡 데이터 본문 */
export interface JobData {
  stages: JobStages;
  output1: Output1StepResult | null;
  outputs23: Outputs23Result | null;
}

export interface JobRecord {
  id: string;
  plnt: string;
  step: JobStep;
  sourceFilenames: string[];
  pgNumbers: Record<string, string>;
  headerOverrides: { docTitle?: string; deliveryDate?: string; footerLeft?: string };
  etcAcknowledged: boolean;
  createdByEmail: string | null;
  createdAt: Date;
  expiresAt: Date;
  data: JobData;
}

export interface TransitionResult {
  ok: boolean;
  job?: JobRecord;
  error?: "not_found" | "illegal_transition" | "conflict";
}

function emptyStages(): JobStages {
  return { stage1: null, stage2: null, stage3: null, stage4: null };
}

function outletFor(plnt: string): string {
  return staticOutletResolver(plnt) ?? "강서";
}

// ============================================================================
// 인메모리 백엔드 (globalThis 싱글톤)
// ============================================================================
const MEM_KEY = Symbol.for("opr-logistics.jobs.store.v2");
type G = typeof globalThis & { [k: symbol]: Map<string, JobRecord> | undefined };
const g = globalThis as G;
const memory: Map<string, JobRecord> = g[MEM_KEY] ?? new Map();
if (!g[MEM_KEY]) g[MEM_KEY] = memory;

// ============================================================================
// 공통 — 부록 D 무효화 적용
// ============================================================================
/** 무효화 적용. clearPg=true면 호출자가 pgNumbers도 비워야 함(invalidationFor가 'pgNumbers' 포함 시). */
function applyInvalidation(
  data: JobData,
  stageN: 1 | 3 | 4
): { data: JobData; clearPg: boolean } {
  const inv = invalidationFor(stageN);
  const next: JobData = {
    stages: { ...data.stages },
    output1: data.output1,
    outputs23: data.outputs23,
  };
  for (const d of inv.discard) {
    if (d === "output1") next.output1 = null;
    if (d === "outputs23") next.outputs23 = null;
    if (d === "stage2") next.stages.stage2 = null;
    if (d === "stage3") next.stages.stage3 = null;
    if (d === "stage4") next.stages.stage4 = null;
  }
  return { data: next, clearPg: inv.discard.includes("pgNumbers") };
}

// ============================================================================
// CREATE — STEP1
// ============================================================================
export interface CreateAtStep1Input {
  stage1: ParsedSheet;
  sourceFilename: string;
  plnt: string;
  createdByEmail: string | null;
}

export async function createJobAtStep1(
  input: CreateAtStep1Input
): Promise<JobRecord> {
  const id = randomUUID();
  const now = new Date();
  const output1 = processOutput1({
    stage1: input.stage1,
    outletResolver: staticOutletResolver,
  });
  const data: JobData = {
    stages: { ...emptyStages(), stage1: input.stage1 },
    output1,
    outputs23: null,
  };
  const rec: JobRecord = {
    id,
    plnt: input.plnt,
    step: "s1_uploaded",
    sourceFilenames: [input.sourceFilename],
    pgNumbers: {},
    headerOverrides: {},
    etcAcknowledged: false,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
    data,
  };
  if (USE_DB) {
    const blob = await putBlob(`jobs/${id}/data.json`, JSON.stringify(data), {
      contentType: "application/json",
      overwrite: true, // 고정 경로 — 고아 blob 방지
    });
    await db.insert(jobsTable).values({
      id,
      plnt: input.plnt,
      step: "s1_uploaded",
      status: "uploaded",
      sourceFilenames: rec.sourceFilenames,
      blobKeys: [blob.key],
      pgNumbers: {},
      headerOverrides: {},
      createdByEmail: input.createdByEmail,
    });
  } else {
    memory.set(id, rec);
  }
  return rec;
}

/**
 * STEP1 재업로드 (PRD §4.10 부록 D) — 기존 잡에 1단계를 다시 올려 전부 무효화 후 재계산.
 * step을 s1_uploaded로 강등, pgNumbers·stage2~4·출력1·2·3 폐기, 출력1 재생성.
 */
export async function reuploadStage1(
  id: string,
  stage1: ParsedSheet,
  sourceFilename: string
): Promise<TransitionResult> {
  const job = await getJob(id);
  if (!job) return { ok: false, error: "not_found" };
  const output1 = processOutput1({ stage1, outletResolver: staticOutletResolver });
  const inv = applyInvalidation(job.data, 1); // stage2~4/출력 전부 폐기
  const next: JobRecord = {
    ...job,
    step: "s1_uploaded",
    pgNumbers: inv.clearPg ? {} : job.pgNumbers,
    sourceFilenames: [sourceFilename],
    data: {
      stages: { ...emptyStages(), stage1 },
      output1,
      outputs23: null,
    },
  };
  return persist(next, job.step); // 현재 step을 expected로 CAS
}

// ============================================================================
// READ
// ============================================================================
function reviveData(raw: JobData): JobData {
  return {
    stages: raw.stages ?? emptyStages(),
    output1: raw.output1 ?? null,
    outputs23: raw.outputs23 ?? null,
  };
}

export async function getJob(id: string): Promise<JobRecord | null> {
  if (!USE_DB) return memory.get(id) ?? null;
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const blobKey = row.blobKeys[0];
  const raw = blobKey ? await getBlobAsJson<JobData>(blobKey) : null;
  // blobKey가 있는데 로드 실패(만료/네트워크/파싱) → 깨진 완료화면 대신 null(404, 새로고침 유도).
  // 단 s1_uploaded 직후 등 blobKey 자체가 없는 경우는 빈 data 허용.
  if (blobKey && raw === null) return null;
  const data = raw ? reviveData(raw) : { stages: emptyStages(), output1: null, outputs23: null };
  // 내부 플래그 _etcAck는 클라이언트로 새지 않게 분리
  const ho = { ...(row.headerOverrides as Record<string, string>) };
  const etcAck = ho._etcAck === "1";
  delete ho._etcAck;
  return {
    id: row.id,
    plnt: row.plnt,
    step: (row.step as JobStep) ?? "s1_uploaded",
    sourceFilenames: row.sourceFilenames,
    pgNumbers: row.pgNumbers,
    headerOverrides: ho,
    etcAcknowledged: etcAck,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    data,
  };
}

// ============================================================================
// 내부 — 잡 데이터/메타 영속화 (DB는 blob 재작성 + step CAS)
// ============================================================================
async function persist(
  rec: JobRecord,
  expectedStep: JobStep | null
): Promise<TransitionResult> {
  if (!USE_DB) {
    // 인메모리: 단일 프로세스라 CAS 불필요하지만 일관성 위해 검사
    const cur = memory.get(rec.id);
    if (cur && expectedStep !== null && cur.step !== expectedStep) {
      return { ok: false, error: "conflict" };
    }
    memory.set(rec.id, rec);
    return { ok: true, job: rec };
  }
  // DB: 고정 경로 blob 덮어쓰기(고아 방지) + step CAS.
  // blob 키가 결정적(jobs/{id}/data.json)이라 CAS 충돌이 나도 blob은 같은 키라 고아 안 됨.
  const blob = await putBlob(
    `jobs/${rec.id}/data.json`,
    JSON.stringify(rec.data),
    { contentType: "application/json", overwrite: true }
  );
  const ho: Record<string, string> = { ...rec.headerOverrides } as Record<string, string>;
  if (rec.etcAcknowledged) ho._etcAck = "1";
  const whereCas =
    expectedStep === null
      ? eq(jobsTable.id, rec.id)
      : dsql`${jobsTable.id} = ${rec.id} AND ${jobsTable.step} = ${expectedStep}`;
  const updated = await db
    .update(jobsTable)
    .set({
      step: rec.step,
      sourceFilenames: rec.sourceFilenames,
      blobKeys: [blob.key],
      pgNumbers: rec.pgNumbers,
      headerOverrides: ho,
    })
    .where(whereCas)
    .returning({ id: jobsTable.id });
  if (updated.length === 0) return { ok: false, error: "conflict" };
  return { ok: true, job: rec };
}

// ============================================================================
// ATTACH STAGE (2/3/4) — CAS 전이 + 누적 + 필요 시 재계산
// ============================================================================
export async function attachStage(
  id: string,
  stageN: 2 | 3 | 4,
  sheet: ParsedSheet,
  sourceFilename: string
): Promise<TransitionResult> {
  const job = await getJob(id);
  if (!job) return { ok: false, error: "not_found" };

  const toStep: JobStep =
    stageN === 2 ? "s2_uploaded" : stageN === 3 ? "s3_uploaded" : "s4_uploaded";

  // 재업로드(이미 그 단계 지났음)면 무효화 강등 후 재첨부
  const isReupload =
    (stageN === 3 && ["s3_uploaded", "s4_uploaded", "ready"].includes(job.step)) ||
    (stageN === 4 && ["s4_uploaded", "ready"].includes(job.step));

  let data = job.data;
  if (isReupload) {
    ({ data } = applyInvalidation(data, stageN === 4 ? 4 : 3));
  } else if (!canTransition(job.step, toStep)) {
    return { ok: false, error: "illegal_transition" };
  }

  // 누적
  const nextData: JobData = {
    stages: { ...data.stages, [`stage${stageN}`]: sheet } as JobStages,
    output1: data.output1,
    outputs23: data.outputs23,
  };

  // STEP6(stage4) 첨부 시점엔 아직 finalize 전 — outputs23은 ready 전이에서 계산
  const next: JobRecord = {
    ...job,
    step: toStep,
    sourceFilenames: Array.from(
      new Set([...job.sourceFilenames, sourceFilename])
    ),
    data: nextData,
  };
  // 정상 전이/재업로드 모두 현재 DB step을 expected로 CAS (동시성 보호 — 재업로드도 보호)
  return persist(next, job.step);
}

// ============================================================================
// SET PG — s1/s2 → pg_entered + 출력1에 PG 머지
// ============================================================================
export async function setPgNumbers(
  id: string,
  pgNumbers: Record<string, string>
): Promise<TransitionResult> {
  const job = await getJob(id);
  if (!job) return { ok: false, error: "not_found" };
  // s1_uploaded 또는 s2_uploaded 에서만 (또는 이미 pg_entered면 재설정 허용)
  const allowed = ["s1_uploaded", "s2_uploaded", "pg_entered"];
  if (!allowed.includes(job.step)) {
    return { ok: false, error: "illegal_transition" };
  }
  const merged = { ...job.pgNumbers, ...pgNumbers };
  // 출력1 행에 PG 머지 (plnt별)
  const out1 = job.data.output1;
  const mergedOut1: Output1StepResult | null = out1
    ? {
        ...out1,
        output1: out1.output1.map((r) => ({
          ...r,
          pgNumber: merged[r.plnt] ?? r.pgNumber,
        })),
      }
    : out1;
  const next: JobRecord = {
    ...job,
    step: "pg_entered",
    pgNumbers: merged,
    data: { ...job.data, output1: mergedOut1 },
  };
  return persist(next, job.step);
}

// ============================================================================
// FINALIZE — s4 → ready, 출력2·3 계산
// ============================================================================
export async function finalizeJob(id: string): Promise<TransitionResult> {
  const job = await getJob(id);
  if (!job) return { ok: false, error: "not_found" };
  if (!canTransition(job.step, "ready") && job.step !== "ready") {
    return { ok: false, error: "illegal_transition" };
  }
  const { stage1, stage3, stage4 } = job.data.stages;
  if (!stage1 || !stage3 || !stage4) {
    return { ok: false, error: "illegal_transition" };
  }
  const outputs23 = processOutputs23({
    stage1,
    stage3,
    stage4,
    outletName: job.data.output1?.outletName ?? outletFor(job.plnt),
  });
  const next: JobRecord = {
    ...job,
    step: "ready",
    data: { ...job.data, outputs23 },
  };
  return persist(next, job.step === "ready" ? "ready" : "s4_uploaded");
}

// ============================================================================
// 헤더/ETC 편집 (전이 아님)
// ============================================================================
export async function updateJobMeta(
  id: string,
  patch: {
    headerOverrides?: JobRecord["headerOverrides"];
    etcAcknowledged?: boolean;
  }
): Promise<TransitionResult> {
  const job = await getJob(id);
  if (!job) return { ok: false, error: "not_found" };
  const next: JobRecord = {
    ...job,
    headerOverrides: { ...job.headerOverrides, ...(patch.headerOverrides ?? {}) },
    etcAcknowledged: patch.etcAcknowledged ?? job.etcAcknowledged,
  };
  return persist(next, null);
}

// ============================================================================
// 관리 — 전체 잡 목록(메타데이터만, blob 미로드) (PRD #0003 §5.4)
// ============================================================================
export interface JobMeta {
  id: string;
  plnt: string;
  step: JobStep;
  createdByEmail: string | null;
  sourceFilenames: string[];
  createdAt: Date;
  expiresAt: Date;
}

export async function listAllJobs(limit = 200): Promise<JobMeta[]> {
  if (!USE_DB) {
    return Array.from(memory.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((j) => ({
        id: j.id,
        plnt: j.plnt,
        step: j.step,
        createdByEmail: j.createdByEmail,
        sourceFilenames: j.sourceFilenames,
        createdAt: j.createdAt,
        expiresAt: j.expiresAt,
      }));
  }
  const rows = await db
    .select({
      id: jobsTable.id,
      plnt: jobsTable.plnt,
      step: jobsTable.step,
      createdByEmail: jobsTable.createdByEmail,
      sourceFilenames: jobsTable.sourceFilenames,
      createdAt: jobsTable.createdAt,
      expiresAt: jobsTable.expiresAt,
    })
    .from(jobsTable)
    .orderBy(dsql`${jobsTable.createdAt} DESC`)
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    plnt: r.plnt,
    step: (r.step as JobStep) ?? "s1_uploaded",
    createdByEmail: r.createdByEmail,
    sourceFilenames: r.sourceFilenames,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
  }));
}

// ============================================================================
// 만료 정리 (cron)
// ============================================================================
export async function deleteExpiredJobs(
  now: Date = new Date()
): Promise<{ deletedIds: string[]; deletedBlobs: string[] }> {
  if (!USE_DB) {
    const deletedIds: string[] = [];
    for (const [id, rec] of memory) {
      if (rec.expiresAt.getTime() <= now.getTime()) {
        memory.delete(id);
        deletedIds.push(id);
      }
    }
    return { deletedIds, deletedBlobs: [] };
  }
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
        /* ignore */
      }
    }
  }
  if (expired.length > 0) {
    await db.delete(jobsTable).where(lte(jobsTable.expiresAt, now));
  }
  return { deletedIds: expired.map((r) => r.id), deletedBlobs };
}

export function storeMode(): "db" | "memory" {
  return USE_DB ? "db" : "memory";
}

/** 테스트용 — 인메모리 비우기 */
export function clearJobStore(): void {
  memory.clear();
}
