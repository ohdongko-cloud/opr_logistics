/**
 * ALLOWED_EMAILS 환경변수 파싱 + 검증 (PRD §4.11 F11)
 *
 * 형식: 쉼표 구분.
 *   - 정확한 이메일:   "alice@gmail.com"
 *   - 도메인 와일드카드: "@eland.co.kr"  (@ 로 시작하면 도메인 전체 허용)
 * 정규화: 소문자 + 양끝 trim. 빈 항목 무시.
 * 미설정 → 빈 set → 모든 로그인 거부 (안전한 기본값).
 */

interface ParsedAllowlist {
  emails: Set<string>;
  /** "@example.com" 형태 — 이메일이 이걸로 끝나면 허용 */
  domains: Set<string>;
}

let cached: ParsedAllowlist | null = null;
let cachedRaw: string | undefined = undefined;

function parseList(raw: string | undefined): ParsedAllowlist {
  const emails = new Set<string>();
  const domains = new Set<string>();
  if (!raw) return { emails, domains };
  for (const item of raw.split(",")) {
    const trimmed = item.trim().toLowerCase();
    if (!trimmed) continue;
    if (trimmed.startsWith("@") && trimmed.length > 1 && trimmed.includes(".")) {
      // 도메인 와일드카드
      domains.add(trimmed);
    } else if (trimmed.includes("@") && trimmed.indexOf("@") > 0) {
      // 정확한 이메일
      emails.add(trimmed);
    }
    // 그 외(빈 토큰, @만 있는 토큰, 도메인 미포함)는 무시
  }
  return { emails, domains };
}

export function getAllowedEmails(): ParsedAllowlist {
  const raw = process.env.ALLOWED_EMAILS;
  if (cached === null || raw !== cachedRaw) {
    cached = parseList(raw);
    cachedRaw = raw;
  }
  return cached;
}

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return false;
  const { emails, domains } = getAllowedEmails();
  // 1) 정확한 이메일 매칭
  if (emails.has(normalized)) return true;
  // 2) 도메인 매칭 — '@eland.co.kr' 같이 끝나면 허용
  for (const d of domains) {
    if (normalized.endsWith(d)) return true;
  }
  return false;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
