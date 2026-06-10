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
import { canSendOtp, invalidateLastOtp, saveOtp } from "@/lib/auth/store";
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

  // 화이트리스트 검증 — 정보 누출 방지를 위해 응답은 동일하게.
  // M9: 타이밍 누출 방어 — 비허용 케이스도 더미 hash 계산 + 200~500ms 랜덤 지연
  if (!isEmailAllowed(email)) {
    // 더미 HMAC 1회 — allowed 케이스의 발송 비용을 흉내
    try {
      const { hashOtpCode } = await import("@/lib/auth/otp");
      hashOtpCode("000000");
    } catch {
      // OTP_PEPPER 미설정 등은 무시
    }
    // 200~500ms 랜덤 지연
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
    // M9: SMTP 실패 시 방금 저장한 OTP를 즉시 무효화 — 사용자가 재발송할 때 throttle 차단 회피
    try {
      await invalidateLastOtp(email);
    } catch {
      // 무효화 실패는 무시 (어차피 10분 TTL)
    }
    // nodemailer 에러 구조에서 진단 정보 추출 (PII 없음)
    const e = err as {
      code?: string;
      command?: string;
      responseCode?: number;
      response?: string;
      message?: string;
    };
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, "$1***$2");
    console.error("[send-otp] SMTP error", {
      email: maskedEmail,
      code: e.code,
      command: e.command,
      responseCode: e.responseCode,
      response: e.response?.slice(0, 240),
      message: e.message,
    });
    // 사용자/디버깅용 카테고리 (PII/시크릿 미포함)
    const category =
      e.code === "EAUTH"
        ? "smtp_auth_failed"
        : e.code === "ECONNECTION" || e.code === "ETIMEDOUT"
          ? "smtp_connection_failed"
          : e.responseCode && e.responseCode >= 500 && e.responseCode < 600
            ? "recipient_rejected"
            : "smtp_failure";
    return NextResponse.json(
      {
        ok: false,
        error: category,
        // 운영에서도 진단 가능하도록 nodemailer 응답코드/명령은 노출 (시크릿 아님)
        smtp: {
          code: e.code ?? null,
          command: e.command ?? null,
          responseCode: e.responseCode ?? null,
        },
      },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
