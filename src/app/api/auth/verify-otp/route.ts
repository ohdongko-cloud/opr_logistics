/**
 * POST /api/auth/verify-otp
 * body: { email: string, code: string (6 digits) }
 *
 * - timing-safe HMAC 비교
 * - 검증 통과 시 세션 쿠키 세팅
 * - 검증 실패 시 enumeration 방지 통일 응답 (단, 401 status)
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { isEmailAllowed, normalizeEmail } from "@/lib/auth/allowlist";
import { isOtpFormat, verifyOtpHash } from "@/lib/auth/otp";
import { setSessionCookie, signSession } from "@/lib/auth/session";
import { verifyOtp } from "@/lib/auth/store";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email().max(200),
  code: z.string().length(6),
});

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
  if (!isOtpFormat(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  if (!isEmailAllowed(email)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const res = await verifyOtp(email, (storedHash) =>
    verifyOtpHash(code, storedHash)
  );
  if (!res.ok) {
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

  const token = await signSession(email);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, email });
}
