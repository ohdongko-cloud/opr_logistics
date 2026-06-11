/**
 * 비밀번호 해싱/검증/정책 (PRD #0004 F2)
 *
 * - Node 내장 scrypt (의존성 추가 없음). per-user 랜덤 salt.
 * - 저장 인코딩: 'scrypt$N$r$p$saltB64$hashB64' (self-describing — 파라미터 변경에도 검증 호환).
 * - 비교는 timingSafeEqual. 평문은 어디에도 로그/저장하지 않는다.
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";

// scrypt 파라미터 (OWASP 권장 범위). N은 2^14.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;
const SCHEME = "scrypt";

const MIN_LENGTH = 8;
const MAX_LENGTH = 200;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // maxmem 상향 — N=16384,r=8,p=1 기본 32MB로는 부족할 수 있어 명시.
    scryptCb(
      password,
      salt,
      keylen,
      { N: opts.N, r: opts.r, p: opts.p, maxmem: 64 * 1024 * 1024 },
      (err, derived) => (err ? reject(err) : resolve(derived))
    );
  });
}

/** 평문 → 'scrypt$N$r$p$saltB64$hashB64' */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEYLEN, { N, r: R, p: P });
  return [
    SCHEME,
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/** 평문 vs 인코딩 비교. 형식 불일치/파싱 실패 → false (throw 금지). */
export async function verifyPassword(
  plain: string,
  encoded: string | null | undefined
): Promise<boolean> {
  if (!encoded) return false;
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== SCHEME) return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = await scryptAsync(plain, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export interface PolicyResult {
  ok: boolean;
  error?: "too_short" | "too_long" | "blank";
}

/** 비밀번호 정책: 최소 8자 (상한 200), 공백 전용 금지. (PRD #0004 F2.3) */
export function validatePasswordPolicy(plain: string): PolicyResult {
  if (typeof plain !== "string" || plain.trim().length === 0) {
    return { ok: false, error: "blank" };
  }
  if (plain.length < MIN_LENGTH) return { ok: false, error: "too_short" };
  if (plain.length > MAX_LENGTH) return { ok: false, error: "too_long" };
  return { ok: true };
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
export const PASSWORD_MAX_LENGTH = MAX_LENGTH;

/**
 * 타이밍 평준화용 더미 해시 (PRD #0004 S2).
 * 비번 미설정/미허용 로그인 실패 경로에서도 verifyPassword가 scrypt를 실제로 수행하게 해,
 * "비밀번호 설정 여부"가 응답시간으로 새지 않도록 한다. (형식만 유효 — 어떤 평문과도 불일치)
 */
export const DUMMY_PASSWORD_HASH = [
  SCHEME,
  N,
  R,
  P,
  Buffer.alloc(SALT_BYTES).toString("base64"),
  Buffer.alloc(KEYLEN).toString("base64"),
].join("$");
