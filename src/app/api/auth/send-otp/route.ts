/**
 * POST /api/auth/send-otp
 * body: { email: string }
 *
 * - 화이트리스트 검증
 * - 60초 throttle
 * - OTP 6자리 생성 → HMAC 해시 저장 → SMTP 발송
 *
 * 전체 핸들러를 try/catch로 감싸 어떤 예외든 JSON으로 반환 (빈 본문 500 방지).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { isEmailAllowed, normalizeEmail } from "@/lib/auth/allowlist";
import { generateOtpCode, hashOtpCode } from "@/lib/auth/otp";
import { canSendOtp, invalidateLastOtp, saveOtp } from "@/lib/auth/store";
import { sendOtpEmail } from "@/lib/email/smtp";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ email: z.string().email().max(200) });

/** unknown 에러에서 진단 필드 안전 추출 (어떤 타입이 와도 throw 안 함) */
function extractErr(err: unknown): {
  name: string | null;
  code: string | null;
  command: string | null;
  responseCode: number | null;
  response: string | null;
  message: string | null;
} {
  const e = (err ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    v == null ? null : String(v).slice(0, 300);
  const num = (v: unknown): number | null =>
    typeof v === "number" ? v : null;
  return {
    name: str(e.name),
    code: str(e.code),
    command: str(e.command),
    responseCode: num(e.responseCode),
    response: str(e.response),
    message: str(e.message),
  };
}

export async function POST(req: Request) {
  try {
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

    // 화이트리스트 검증 — enumeration 방지 위해 동일 200 응답 + 더미 지연
    if (!isEmailAllowed(email)) {
      try {
        hashOtpCode("000000");
      } catch {
        // OTP_PEPPER 미설정/약함 — 무시
      }
      const delay = 200 + Math.floor(Math.random() * 300);
      await new Promise((r) => setTimeout(r, delay));
      return NextResponse.json({ ok: true, throttled: false });
    }

    const throttle = await canSendOtp(email);
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
    await saveOtp({ email, codeHash, requestIp: ip });

    try {
      await sendOtpEmail({ to: email, code, ip });
    } catch (err) {
      // SMTP 실패 시 방금 저장한 OTP 무효화 → 재발송 throttle 회피
      try {
        await invalidateLastOtp(email);
      } catch {
        /* noop */
      }
      const d = extractErr(err);
      const maskedEmail = email.replace(/(.{2}).+(@.+)/, "$1***$2");
      console.error("[send-otp] SMTP error", { email: maskedEmail, ...d });
      const category =
        d.code === "EAUTH"
          ? "smtp_auth_failed"
          : d.code === "ECONNECTION" ||
              d.code === "ETIMEDOUT" ||
              d.code === "ESOCKET"
            ? "smtp_connection_failed"
            : d.responseCode && d.responseCode >= 500 && d.responseCode < 600
              ? "recipient_rejected"
              : "smtp_failure";
      return NextResponse.json(
        {
          ok: false,
          error: category,
          smtp: {
            code: d.code,
            command: d.command,
            responseCode: d.responseCode,
            // 진단용 — SMTP 응답/메시지 (시크릿 아님, 300자 제한)
            response: d.response,
            message: d.message,
          },
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 어떤 예외든 JSON으로 — 빈 본문 500 방지
    const d = extractErr(err);
    console.error("[send-otp] unhandled", d);
    return NextResponse.json(
      { ok: false, error: "internal", diag: d },
      { status: 500 }
    );
  }
}
