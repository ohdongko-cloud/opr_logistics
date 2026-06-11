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

    // jobs 컬럼 점검 — 업로드 500의 유력 원인(step 컬럼 미적용/마이그레이션 0002 누락) 진단용
    const colRows = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'jobs' ORDER BY column_name`
    );
    const colList =
      (colRows as unknown as { rows?: { column_name: string }[] }).rows ??
      (colRows as unknown as { column_name: string }[]);
    const jobsColumns = (Array.isArray(colList) ? colList : []).map(
      (r) => r.column_name
    );
    const REQUIRED_JOB_COLS = [
      "id", "plnt", "step", "status", "source_filenames",
      "blob_keys", "pg_numbers", "header_overrides", "created_by_email",
    ];
    const missingJobCols = REQUIRED_JOB_COLS.filter(
      (c) => !jobsColumns.includes(c)
    );

    const tableHint =
      missing.length > 0
        ? `다음 테이블 누락: ${missing.join(", ")} — 'npm run db:migrate' 실행 필요`
        : "모든 테이블 존재 ✓";
    const colHint =
      missingJobCols.length > 0
        ? `jobs 컬럼 누락: ${missingJobCols.join(", ")} — 'npm run db:migrate'(0002 등) 실행 필요. 업로드 500의 원인일 수 있음`
        : "jobs 필수 컬럼 모두 존재 ✓";

    return NextResponse.json({
      ok: missing.length === 0 && missingJobCols.length === 0,
      present,
      missing,
      expected: EXPECTED,
      jobsColumns,
      missingJobCols,
      hint: tableHint,
      jobsHint: colHint,
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
