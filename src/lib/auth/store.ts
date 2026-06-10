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

/**
 * verifyOtpDb — M9 race condition 차단 강화
 *
 * 핵심: 'attempts < 5 AND consumed_at IS NULL AND expires_at > now()' 조건을 *원자적으로*
 * UPDATE 절에 포함해 시도횟수를 증가시키고, RETURNING으로 code_hash + 갱신된 attempts를
 * 가져온다. 두 동시 요청이 들어와도 한 쪽은 갱신된 attempts를 본다.
 *
 *   UPDATE email_otps
 *   SET attempts = attempts + 1
 *   WHERE id = (
 *       SELECT id FROM email_otps
 *       WHERE email = $1 AND consumed_at IS NULL
 *       ORDER BY created_at DESC LIMIT 1
 *   )
 *   AND attempts < 5 AND expires_at > now()
 *   RETURNING code_hash, attempts, expires_at
 */
async function verifyOtpDb(
  email: string,
  verifyFn: (storedHash: string) => boolean
): Promise<VerifyResult> {
  const now = new Date();
  // 1) 가장 최근 미소비 row 조회 (만료/시도수 검사용)
  const peek = await db
    .select()
    .from(otpsTable)
    .where(and(eq(otpsTable.email, email), isNull(otpsTable.consumedAt)))
    .orderBy(desc(otpsTable.createdAt))
    .limit(1);
  const rec = peek[0];
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

  // 2) attempts +1을 조건부 atomic UPDATE — race condition 시 다른 쪽이 이미 증가시켰을 수 있음
  const claimed = await db
    .update(otpsTable)
    .set({ attempts: drizzleSql`${otpsTable.attempts} + 1` })
    .where(
      and(
        eq(otpsTable.id, rec.id),
        isNull(otpsTable.consumedAt),
        drizzleSql`${otpsTable.attempts} < ${OTP_MAX_ATTEMPTS}`
      )
    )
    .returning({
      id: otpsTable.id,
      codeHash: otpsTable.codeHash,
      attempts: otpsTable.attempts,
    });
  if (claimed.length === 0) {
    // 동시 요청에 의해 이미 max attempts 초과 또는 consumed
    return { ok: false, reason: "too_many_attempts" };
  }
  const c = claimed[0]!;

  if (!verifyFn(c.codeHash)) {
    return { ok: false, reason: "mismatch" };
  }
  // 3) consumed 마킹 — 검증 통과 케이스에만
  const consumed = await db
    .update(otpsTable)
    .set({ consumedAt: now })
    .where(and(eq(otpsTable.id, c.id), isNull(otpsTable.consumedAt)))
    .returning({ id: otpsTable.id });
  if (consumed.length === 0) {
    // 다른 동시 요청이 이미 consumed — 재사용 방지
    return { ok: false, reason: "not_found" };
  }
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

/**
 * 가장 최근 미소비 OTP를 consumed로 마킹 — SMTP 실패 시 throttle 회피용 (M9)
 */
export async function invalidateLastOtp(email: string): Promise<void> {
  if (USE_DB) {
    await db
      .update(otpsTable)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpsTable.email, email), isNull(otpsTable.consumedAt)));
    return;
  }
  const rec = memory.get(email);
  if (rec && !rec.consumedAt) {
    rec.consumedAt = new Date();
  }
}

export function otpStoreMode(): "db" | "memory" {
  return USE_DB ? "db" : "memory";
}
