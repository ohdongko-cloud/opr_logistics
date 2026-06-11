/**
 * POST /api/auth/login  (PRD #0004 F3)
 * body: { email, password }
 *
 * - 비밀번호가 설정된 회원의 1스텝 로그인 (OTP 불요).
 * - 레이트리밋: IP + 이메일 (브루트포스 완화).
 * - enumeration 방지: 미가입/미설정/오답 모두 통일 401 invalid_credentials.
 * - 평문 비밀번호는 로그/응답에 남기지 않는다.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/allowlist";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import {
  checkLoginAllowed,
  getPasswordHash,
  provisionLogin,
  recordLogin,
  touchLastLogin,
  type LoginReason,
} from "@/lib/auth/roles";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import {
  clientIp,
  LOGIN_EMAIL_LIMIT,
  LOGIN_IP_LIMIT,
  rateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function ipOf(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

export async function POST(req: Request) {
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
  const email = normalizeEmail(parsed.data.email);
  const password = parsed.data.password;
  const ip = ipOf(req);
  const ua = req.headers.get("user-agent");

  // 레이트리밋 — IP 및 이메일 (둘 중 하나라도 초과 시 429)
  const ipKey = clientIp(req);
  const rlIp = rateLimit(`login:ip:${ipKey}`, LOGIN_IP_LIMIT.limit, LOGIN_IP_LIMIT.windowSeconds);
  const rlEmail = rateLimit(`login:email:${email}`, LOGIN_EMAIL_LIMIT.limit, LOGIN_EMAIL_LIMIT.windowSeconds);
  if (!rlIp.ok || !rlEmail.ok) {
    const retry = Math.max(rlIp.retryAfterSeconds ?? 0, rlEmail.retryAfterSeconds ?? 0) || 60;
    return NextResponse.json(
      { error: "too_many_attempts", retryAfterSeconds: retry },
      { status: 429, headers: { "retry-after": String(retry) } }
    );
  }

  const log = (success: boolean, reason: LoginReason) =>
    recordLogin({ email, ip, userAgent: ua, success, reason }).catch(() => {});

  const fail = async (reason: LoginReason) => {
    await log(false, reason);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  };

  const allowed = await checkLoginAllowed(email);
  const hash = await getPasswordHash(email);
  // 타이밍 평준화: 미허용/미설정이어도 항상 scrypt 1회 수행 (비번 설정 여부 누출 방지, S2)
  const ok = await verifyPassword(password, hash ?? DUMMY_PASSWORD_HASH);

  if (!allowed.ok) return fail(allowed.reason); // withdrawn/미허용
  if (!hash) return fail("no_password"); // 비밀번호 미설정 → OTP 경로 유도(통일 응답)
  if (!ok) return fail("wrong_password");

  // 성공
  await provisionLogin(email);
  await touchLastLogin(email);
  await log(true, "success");
  const token = await signSession(email);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, email });
}
