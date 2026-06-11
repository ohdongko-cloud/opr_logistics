/**
 * POST /api/auth/set-password  (PRD #0004 F5)
 * body: { password, confirm }
 *
 * - 세션 필수(=본인 증명: 직전 OTP 검증 또는 로그인 세션). 타인 비번 변경 불가.
 * - 최초 설정 / 분실 재설정 / 기존 사용자 전환 모두 이 엔드포인트로 처리.
 * - 평문은 해싱 후 저장, 응답/로그에 평문 비노출.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  hashPassword,
  validatePasswordPolicy,
} from "@/lib/auth/password";
import { recordLogin, setPassword } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";
import { clientIp, rateLimit, SETPW_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  password: z.string().min(1).max(200),
  confirm: z.string().min(1).max(200),
});

function ipOf(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: Request) {
  const email = await getCurrentEmail();
  if (!email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`setpw:ip:${clientIp(req)}`, SETPW_LIMIT.limit, SETPW_LIMIT.windowSeconds);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "too_many_attempts", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { password, confirm } = parsed.data;

  if (password !== confirm) {
    return NextResponse.json({ error: "mismatch" }, { status: 400 });
  }
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    return NextResponse.json({ error: "weak_password", reason: policy.error }, { status: 400 });
  }

  const encoded = await hashPassword(password);
  try {
    await setPassword(email, encoded);
  } catch (err) {
    // password_hash 컬럼 미적용(마이그레이션 지연) 등 — 사용자에 안정적 코드만.
    console.error("[set-password] setPassword failed:", err);
    return NextResponse.json({ error: "password_unavailable" }, { status: 503 });
  }
  await recordLogin({
    email,
    ip: ipOf(req),
    userAgent: req.headers.get("user-agent"),
    success: true,
    reason: "password_set",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
