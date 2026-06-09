/**
 * OTP Store (PRD §4.11 F11 / M7·M8)
 *
 *   DATABASE_URL 환경변수가 있으면 Neon Drizzle (`email_otps` 테이블) 사용.
 *   없으면 인메모리(globalThis 싱글톤) 폴백 — 개발/테스트/CI 용.
 */
import { and, desc, eq, gt, isNull, sql as drizzleSql } from "drizzle-orm";

import { db } from "@/db";
import { emailOtps as otpsTable } from "@/db/schema";
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_THROTTLE_SECONDS,
  OTP_TTL_MINUTES,
} from "./otp";

const USE_DB =
  !!(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);

export interface OtpRecord {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
  consumedAt: Date | null;
  requestIp: string | null;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "expired" | "too_many_attempts" | "mismatch";
    };

// ============================================================================
// 메모리 백엔드
// ============================================================================

const MEM_KEY = Symbol.for("opr-logistics.auth.otp.store.v1");
type G = typeof globalThis & { [k: symbol]: Map<string, OtpRecord> | undefined };
const g = globalThis as G;
const memory: Map<string, OtpRecord> =
  g[MEM_KEY] ?? new Map<string, OtpRecord>();
if (!g[MEM_KEY]) g[MEM_KEY] = memory;

function pruneMemoryExpired(now: Date) {
  for (const [email, rec] of memory) {
    if (rec.expiresAt.getTime() < now.getTime()) {
      memory.delete(email);
    }
  }
}

async function canSendOtpMemory(
  email: string
): Promise<{ ok: boolean; retryAfterSeconds?: number }> {
  pruneMemoryExpired(new Date());
  const existing = memory.get(email);
  if (!existing || existing.consumedAt) return { ok: true };
  const elapsed = Math.floor(
    (Date.now() - existing.createdAt.getTime()) / 1000
  );
  if (elapsed < OTP_RESEND_THROTTLE_SECONDS) {
    return {
      ok: false,
      retryAfterSeconds: OTP_RESEND_THROTTLE_SECONDS - elapsed,
    };
  }
  return { ok: true };
}

async function saveOtpMemory(input: {
  email: string;
  codeHash: string;
  requestIp?: string | null;
}): Promise<OtpRecord> {
  const now = new Date();
  const rec: OtpRecord = {
    email: input.email,
    codeHash: input.codeHash,
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60_000),
    attempts: 0,
    createdAt: now,
    consumedAt: null,
    requestIp: input.requestIp ?? null,
  };
  memory.set(input.email, rec);
  return rec;
}

async function verifyOtpMemory(
  email: string,
  verifyFn: (storedHash: string) => boolean
): Promise<VerifyResult> {
  pruneMemoryExpired(new Date());
  const rec = memory.get(email);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.consumedAt) return { ok: false, reason: "not_found" };
  if (rec.expiresAt.getTime() < Date.now()) {
    memory.delete(email);
    return { ok: false, reason: "expired" };
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }
  rec.attempts += 1;
  if (!verifyFn(rec.codeHash)) {
    return { ok: false, reason: "mismatch" };
  }
  rec.consumedAt = new Date();
  return { ok: true };
}

// ============================================================================
// DB 백엔드
// ============================================================================

async function canSendOtpDb(
  email: string
): Promise<{ ok: boolean; retryAfterSeconds?: number }> {
  const now = new Date();
  const rows = await db
    .select()
    .from(otpsTable)
    .where(
      and(
        eq(otpsTable.email, email),
        isNull(otpsTable.consumedAt),
        gt(otpsTable.expiresAt, now)
      )
    )
    .orderBy(desc(otpsTable.createdAt))
    .limit(1);
  const existing = rows[0];
  if (!existing) return { ok: true };
  const elapsed = Math.floor((now.getTime() - existing.createdAt.getTime()) / 1000);
  if (elapsed < OTP_RESEND_THROTTLE_SECONDS) {
    return {
      ok: false,
      retryAfterSeconds: OTP_RESEND_THROTTLE_SECONDS - elapsed,
    };
  }
  return { ok: true };
}

async function saveOtpDb(input: {
  email: string;
  codeHash: string;
  requestIp?: string | null;
}): Promise<OtpRecord> {
  // 같은 이메일의 미소비 OTP는 모두 consumed 마킹 (사실상 무효화)
  await db
    .update(otpsTable)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(otpsTable.email, input.email), isNull(otpsTable.consumedAt))
    );

  const inserted = await db
    .insert(otpsTable)
    .values({
      email: input.email,
      codeHash: input.codeHash,
      requestIp: input.requestIp ?? null,
    })
    .returning();
  const row = inserted[0]!;
  return {
    email: row.email,
    codeHash: row.codeHash,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
    consumedAt: row.consumedAt,
    requestIp: row.requestIp,
  };
}

async function verifyOtpDb(
  email: string,
  verifyFn: (storedHash: string) => boolean
): Promise<VerifyResult> {
  const now = new Date();
  const rows = await db
    .select()
    .from(otpsTable)
    .where(and(eq(otpsTable.email, email), isNull(otpsTable.consumedAt)))
    .orderBy(desc(otpsTable.createdAt))
    .limit(1);
  const rec = rows[0];
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.expiresAt.getTime() < now.getTime()) {
    await db
      .update(otpsTable)
      .set({ consumedAt: now })
      .where(eq(otpsTable.id, rec.id));
    return { ok: false, reason: "expired" };
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }
  // 시도 횟수 +1 (성공/실패 무관) — race condition 회피 위해 raw SQL
  await db
    .update(otpsTable)
    .set({ attempts: drizzleSql`${otpsTable.attempts} + 1` })
    .where(eq(otpsTable.id, rec.id));

  if (!verifyFn(rec.codeHash)) {
    return { ok: false, reason: "mismatch" };
  }
  await db
    .update(otpsTable)
    .set({ consumedAt: now })
    .where(eq(otpsTable.id, rec.id));
  return { ok: true };
}

// ============================================================================
// Public API
// ============================================================================

export async function canSendOtp(email: string) {
  return USE_DB ? canSendOtpDb(email) : canSendOtpMemory(email);
}

export async function saveOtp(input: {
  email: string;
  codeHash: string;
  requestIp?: string | null;
}): Promise<OtpRecord> {
  return USE_DB ? saveOtpDb(input) : saveOtpMemory(input);
}

export async function verifyOtp(
  email: string,
  verifyFn: (storedHash: string) => boolean
): Promise<VerifyResult> {
  return USE_DB ? verifyOtpDb(email, verifyFn) : verifyOtpMemory(email, verifyFn);
}

/** 테스트용 — 메모리만 비움 (DB 모드에선 무효) */
export function clearOtpStore(): void {
  memory.clear();
}

export function otpStoreMode(): "db" | "memory" {
  return USE_DB ? "db" : "memory";
}
