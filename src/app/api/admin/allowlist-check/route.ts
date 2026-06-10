/**
 * GET /api/admin/allowlist-check?email=<email>
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * 현재 ALLOWED_EMAILS 파싱 결과 + 주어진 이메일의 허용 여부를 반환.
 * 디버깅용 — 운영자만 호출 가능.
 *
 * 응답:
 *   {
 *     input: "x@eland.co.kr",
 *     allowed: true | false,
 *     parsed: {
 *       emails: ["o***@gmail.com", ...],   // 마스킹된 이메일
 *       domains: ["@eland.co.kr", ...],    // 도메인은 그대로 (이메일 아님)
 *     },
 *     rawSetByEnv: { exists: true, length: 23, preview: "..." }
 *   }
 */
import { NextResponse } from "next/server";

import { getAllowedEmails, isEmailAllowed } from "@/lib/auth/allowlist";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function maskEmail(e: string): string {
  const at = e.indexOf("@");
  if (at < 1) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***${domain}`;
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
  const input = (url.searchParams.get("email") ?? "").trim();
  const allowed = input ? isEmailAllowed(input) : false;
  const parsed = getAllowedEmails();
  const raw = process.env.ALLOWED_EMAILS;

  return NextResponse.json({
    input,
    allowed,
    parsed: {
      emails: Array.from(parsed.emails).map(maskEmail),
      domains: Array.from(parsed.domains), // 도메인은 그 자체로 PII가 아님
    },
    rawEnvDiagnostic: {
      exists: typeof raw === "string",
      length: raw?.length ?? 0,
      // 처음 60자만, 한글/특수문자 노출 (디버깅용; 시크릿이 아니므로 안전)
      preview: raw ? raw.slice(0, 60) : null,
      // 전각 @ 같은 가시성 낮은 문자가 있는지 확인용
      codepoints: raw
        ? Array.from(raw)
            .slice(0, 30)
            .map((c) => ({
              c,
              code: c.codePointAt(0),
            }))
        : null,
    },
  });
}
