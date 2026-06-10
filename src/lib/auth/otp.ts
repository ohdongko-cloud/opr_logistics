/**
 * 이메일 OTP 생성/해시/검증 (PRD §4.11 F11 / M7)
 *
 * - 6자리 numeric (000000~999999)
 * - HMAC-SHA256(code, OTP_PEPPER)로 해시 저장 (원본 평문 보관 X)
 * - TTL 10분 (DB default), 최대 시도 5회
 * - 인증 후 consumedAt 마킹하여 재사용 방지
 */
import { createHmac, randomInt } from "node:crypto";

export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MINUTES = 10;
/** 한 이메일당 OTP 재발송 최소 간격(초) — 스팸 방지 */
export const OTP_RESEND_THROTTLE_SECONDS = 60;

export function generateOtpCode(): string {
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper) {
    throw new Error("OTP_PEPPER 환경변수가 설정되지 않았습니다.");
  }
  if (pepper.length < 32) {
    throw new Error(
      "OTP_PEPPER 는 최소 32자 이상이어야 합니다. node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" 로 재생성하세요."
    );
  }
  return createHmac("sha256", pepper).update(code).digest("hex");
}

/** timing-safe 비교 */
export function verifyOtpHash(code: string, storedHash: string): boolean {
  try {
    const calc = hashOtpCode(code);
    if (calc.length !== storedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < calc.length; i++) {
      diff |= calc.charCodeAt(i) ^ storedHash.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export function isOtpFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}
