/**
 * 베스트에포트 인메모리 레이트리밋 (PRD #0002 §4.0 / AC9-d)
 *
 * Vercel 서버리스는 인스턴스가 여러 개라 완전하진 않지만(인스턴스별 카운터),
 * 인증된 사용자라도 대용량 업로드를 무제한 반복하는 것을 막는 방어선.
 * 고정 윈도우(fixed window) 카운터.
 */
const STORE_KEY = Symbol.for("opr-logistics.ratelimit.v1");
type Bucket = { count: number; resetAt: number };
type G = typeof globalThis & { [k: symbol]: Map<string, Bucket> | undefined };
const g = globalThis as G;
const buckets: Map<string, Bucket> = g[STORE_KEY] ?? new Map();
if (!g[STORE_KEY]) g[STORE_KEY] = buckets;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
}

/**
 * @param key   식별자 (예: `upload:${ip}`)
 * @param limit 윈도우당 허용 횟수
 * @param windowSeconds 윈도우 길이(초)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000),
    };
  }
  b.count += 1;
  return { ok: true, remaining: limit - b.count };
}

/** 요청에서 클라이언트 IP 추출 (Vercel/프록시 헤더) */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** 업로드(분당 5회) / 일반 편집·전이(분당 30회) 프리셋 */
export const UPLOAD_LIMIT = { limit: 5, windowSeconds: 60 };
export const EDIT_LIMIT = { limit: 30, windowSeconds: 60 };

/** 테스트용 */
export function clearRateLimits(): void {
  buckets.clear();
}
