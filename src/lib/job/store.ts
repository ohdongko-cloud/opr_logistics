/**
 * 인메모리 잡 저장 — M5에서 Neon + Vercel Blob으로 교체.
 *
 * 개발/M4 미리보기 단계에서만 사용. 프로세스 재시작 시 데이터 휘발.
 * jobId는 UUID v4 (PRD §4.10·§4.11 — 예측 불가).
 */
import { randomUUID } from "node:crypto";
import type { ProcessedJob } from "@/lib/generate/process";
import type { RawStage } from "@/lib/parser/signatures";

export interface JobRecord {
  id: string;
  plnt: string;
  outletName: string;
  /** 업로드된 파일명 목록 (메타) */
  sourceFilenames: string[];
  /** 자동 판별된 시트명 매핑 */
  detectedSheets: Record<RawStage, string | null>;
  /** 처리 결과 */
  processed: ProcessedJob;
  /** PG 입력 (F7) */
  pgNumbers: Record<string, string>;
  /** 머리글 / 바닥글 사용자 오버라이드 */
  headerOverrides: {
    docTitle?: string;
    deliveryDate?: string;
    footerLeft?: string;
  };
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Next.js dev (HMR/Turbopack)에서 모듈이 재로드돼도 Map 인스턴스를 유지하기 위해
 * globalThis에 보관. M5에서 Neon으로 교체하면 이 패턴은 불필요.
 */
const STORE_KEY = Symbol.for("opr-logistics.jobs.store.v1");
type GlobalWithStore = typeof globalThis & {
  [k: symbol]: Map<string, JobRecord> | undefined;
};
const g = globalThis as GlobalWithStore;
const store: Map<string, JobRecord> = g[STORE_KEY] ?? new Map<string, JobRecord>();
if (!g[STORE_KEY]) g[STORE_KEY] = store;

export interface CreateJobInput {
  plnt: string;
  outletName: string;
  sourceFilenames: string[];
  detectedSheets: Record<RawStage, string | null>;
  processed: ProcessedJob;
}

export function createJob(input: CreateJobInput): JobRecord {
  const id = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const rec: JobRecord = {
    id,
    plnt: input.plnt,
    outletName: input.outletName,
    sourceFilenames: input.sourceFilenames,
    detectedSheets: input.detectedSheets,
    processed: input.processed,
    pgNumbers: {},
    headerOverrides: {},
    createdAt: now,
    expiresAt,
  };
  store.set(id, rec);
  return rec;
}

export function getJob(id: string): JobRecord | null {
  return store.get(id) ?? null;
}

export function updateJob(
  id: string,
  patch: Partial<Pick<JobRecord, "pgNumbers" | "headerOverrides">>
): JobRecord | null {
  const rec = store.get(id);
  if (!rec) return null;
  if (patch.pgNumbers) rec.pgNumbers = { ...rec.pgNumbers, ...patch.pgNumbers };
  if (patch.headerOverrides) rec.headerOverrides = { ...rec.headerOverrides, ...patch.headerOverrides };
  return rec;
}

export function listJobs(): JobRecord[] {
  return Array.from(store.values());
}

export function deleteJob(id: string): boolean {
  return store.delete(id);
}
