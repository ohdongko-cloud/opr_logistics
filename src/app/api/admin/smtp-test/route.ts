/**
 * GET /api/admin/smtp-test
 *   ?to=<email>
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * SMTP 발송을 직접 시도하고 nodemailer 응답을 그대로 돌려준다.
 * 디버깅 전용 — 운영자만 CRON_SECRET 으로 호출 가능.
 *
 * 응답:
 *   { ok: true, info: { messageId, accepted, rejected, response } }
 *   { ok: false, code, responseCode, command, response, message }
 */
import { NextResponse } from "next/server";

import { getTransporter } from "@/lib/email/smtp";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 32) {
    return NextResponse.json({ error: "secret_misconfigured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/, "");
  if (!presented || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const to = (url.searchParams.get("to") ?? "").trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "invalid_to" }, { status: 400 });
  }

  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from:
        process.env.SMTP_FROM ?? `OPR Logistics <${process.env.SMTP_USER}>`,
      to,
      subject: "[OPR] SMTP 연결 테스트",
      text: "이 메일이 도착했다면 SMTP 발송 경로가 정상입니다.",
    });
    return NextResponse.json({
      ok: true,
      info: {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response?.slice?.(0, 240) ?? null,
      },
    });
  } catch (err) {
    const e = err as {
      code?: string;
      command?: string;
      responseCode?: number;
      response?: string;
      message?: string;
    };
    return NextResponse.json(
      {
        ok: false,
        code: e.code ?? null,
        command: e.command ?? null,
        responseCode: e.responseCode ?? null,
        response: e.response?.slice?.(0, 480) ?? null,
        message: e.message ?? null,
      },
      { status: 502 }
    );
  }
}
