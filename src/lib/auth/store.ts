/**
 * OTP 인메모리 store — M8에서 Neon `email_otps` 테이블로 교체.
 *
 * 동일한 globalThis 패턴으로 HMR 안전.
 */
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_THROTTLE_SECONDS,
  OTP_TTL_MINUTES,
} from "./otp";

export interface OtpRecord {
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
  consumedAt: Date | null;
  requestIp: string | null;
}

const STORE_KEY = Symbol.for("opr-logistics.auth.otp.store.v1");
type G = typeof globalThis & { [k: symbol]: Map<string, OtpRecord> | undefined };
const g = globalThis as G;
const store: Map<string, OtpRecord> =
  g[STORE_KEY] ?? new Map<string, OtpRecord>();
if (!g[STORE_KEY]) g[STORE_KEY] = store;

function pruneExpired(now: Date = new Date()) {
  for (const [email, rec] of store) {
    if (rec.expiresAt.getTime() < now.getTime()) {
      store.delete(email);
    }
  }
}

/** 발송 가능 여부 — 같은 이메일에 대한 throttle 검사 */
export function canSendOtp(email: string): {
  ok: boolean;
  retryAfterSeconds?: number;
} {
  pruneExpired();
  const existing = store.get(email);
  if (!existing || existing.consumedAt) return { ok: true };
  const elapsed = Math.floor((Date.now() - existing.createdAt.getTime()) / 1000);
  if (elapsed < OTP_RESEND_THROTTLE_SECONDS) {
    return { ok: false, retryAfterSeconds: OTP_RESEND_THROTTLE_SECONDS - elapsed };
  }
  return { ok: true };
}

export function saveOtp(input: {
  email: string;
  codeHash: string;
  requestIp?: string | null;
}): OtpRecord {
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
  store.set(input.email, rec);
  return rec;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

/**
 * OTP 검증. verifyFn으로 timing-safe 비교 주입.
 */
export function verifyOtp(
  email: string,
  verifyFn: (storedHash: string) => boolean
): VerifyResult {
  pruneExpired();
  const rec = store.get(email);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.consumedAt) return { ok: false, reason: "not_found" };
  if (rec.expiresAt.getTime() < Date.now()) {
    store.delete(email);
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

/** 테스트용 — 인메모리 비우기 */
export function clearOtpStore(): void {
  store.clear();
}
