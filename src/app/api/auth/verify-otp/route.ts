/**
 * POST /api/auth/verify-otp
 * body: { email: string, code: string (6 digits) }
 *
 * - timing-safe HMAC 비교
 * - 검증 통과 시 회원 프로비저닝 + 세션 쿠키 + last_login 갱신
 * - 성공/실패를 login_logs에 적재 (PRD #0003 F2)
 * - enumeration 방지 통일 응답
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { normalizeEmail } from "@/lib/auth/allowlist";
import { isOtpFormat, verifyOtpHash } from "@/lib/auth/otp";
import {
  checkLoginAllowed,
  hasPassword,
  provisionLogin,
  recordLogin,
  touchLastLogin,
  type LoginReason,
} from "@/lib/auth/roles";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { verifyOtp } from "@/lib/auth/store";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
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
  const code = parsed.data.code.trim();
  const ip = ipOf(req);
  const ua = req.headers.get("user-agent");

  const log = (success: boolean, reason: LoginReason) =>
    recordLogin({ email, ip, userAgent: ua, success, reason }).catch(() => {});

  if (!isOtpFormat(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const allowed = await checkLoginAllowed(email);
  if (!allowed.ok) {
    await log(false, allowed.reason);
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const res = await verifyOtp(email, (storedHash) =>
    verifyOtpHash(code, storedHash)
  );
  if (!res.ok) {
    const reason: LoginReason =
      res.reason === "too_many_attempts"
        ? "too_many_attempts"
        : res.reason === "expired"
          ? "expired"
          : "wrong_code";
    await log(false, reason);
    return NextResponse.json(
      {
        error:
          res.reason === "too_many_attempts"
            ? "too_many_attempts"
            : res.reason === "expired"
              ? "expired"
              : "invalid_credentials",
      },
      { status: res.reason === "too_many_attempts" ? 429 : 401 }
    );
  }

  // 성공 — 프로비저닝 + last_login + 세션
  await provisionLogin(email);
  await touchLastLogin(email);
  await log(true, "success");
  const token = await signSession(email);
  await setSessionCookie(token);
  // 비밀번호 미설정이면 클라이언트가 /set-password로 유도 (PRD #0004 F4.1/F6.3)
  // 컬럼 미적용(마이그레이션 지연) 등 오류 시 강제 설정하지 않고 OTP 로그인으로 진행.
  let needsPasswordSetup = false;
  try {
    needsPasswordSetup = !(await hasPassword(email));
  } catch {
    needsPasswordSetup = false;
  }
  return NextResponse.json({ ok: true, email, needsPasswordSetup });
}
