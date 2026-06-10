/**
 * GET /api/admin/db-introspect
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * 운영 DB에 어떤 테이블이 있는지 + 각 행 수를 반환. 마이그레이션 검증용.
 */
import { NextResponse } from "next/server";

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const EXPECTED = [
  "plants",
  "jobs",
  "cleanup_log",
  "email_otps",
  "sessions",
];

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

  try {
    const rows = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    // drizzle execute는 { rows } 또는 배열 형태일 수 있음 — 양쪽 대응
    const list =
      (rows as unknown as { rows?: { table_name: string }[] }).rows ??
      (rows as unknown as { table_name: string }[]);
    const present = (Array.isArray(list) ? list : []).map(
      (r) => r.table_name
    );
    const missing = EXPECTED.filter((t) => !present.includes(t));

    return NextResponse.json({
      ok: missing.length === 0,
      present,
      missing,
      expected: EXPECTED,
      hint:
        missing.length > 0
          ? `다음 테이블 누락: ${missing.join(", ")} — 'npm run db:migrate' 실행 필요`
          : "모든 테이블 존재 ✓",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "introspect_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
