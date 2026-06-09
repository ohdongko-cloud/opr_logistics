/**
 * ALLOWED_EMAILS 환경변수 파싱 + 검증 (PRD §4.11 F11)
 *
 * 형식: 쉼표 구분 이메일 목록.
 * 정규화: 소문자 + 양끝 trim. 빈 항목 무시.
 * 미설정 → 빈 set → 모든 로그인 거부 (안전한 기본값).
 */

let cached: Set<string> | null = null;
let cachedRaw: string | undefined = undefined;

function parseList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s.includes("@"))
  );
}

export function getAllowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS;
  if (cached === null || raw !== cachedRaw) {
    cached = parseList(raw);
    cachedRaw = raw;
  }
  return cached;
}

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return getAllowedEmails().has(normalized);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
