/**
 * POST /api/auth/send-otp
 * body: { email: string }
 *
 * - 화이트리스트 검증
 * - 60초 throttle
 * - OTP 6자리 생성 → HMAC 해시 저장 → Gmail SMTP 발송
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { isEmailAllowed, normalizeEmail } from "@/lib/auth/allowlist";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { canSendOtp, saveOtp } from "@/lib/auth/store";
import { sendOtpEmail } from "@/lib/email/smtp";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ email: z.string().email().max(200) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);

  // 화이트리스트 검증 — 정보 누출 방지를 위해 응답은 동일하게
  // (대신 발송도 안 함)
  if (!isEmailAllowed(email)) {
    // 같은 응답으로 enumeration 방지. 단, 실제 발송 안 함.
    return NextResponse.json({ ok: true, throttled: false });
  }

  const throttle = canSendOtp(email);
  if (!throttle.ok) {
    return NextResponse.json(
      {
        ok: false,
        throttled: true,
        retryAfterSeconds: throttle.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  saveOtp({ email, codeHash, requestIp: ip });

  try {
    await sendOtpEmail({ to: email, code, ip });
  } catch (err) {
    // SMTP 오류는 OTP를 저장한 채로 응답. 사용자는 재발송 시도 가능.
    console.error("[send-otp] SMTP error", {
      email: email.replace(/(.{2}).+(@.+)/, "$1***$2"),
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: "smtp_failure" },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
