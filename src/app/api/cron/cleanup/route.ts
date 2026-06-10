/**
 * GET /api/cron/cleanup — 7일 TTL 자동 삭제 (PRD §4.10 F10 / AC9 / AC14)
 *
 * Vercel Cron이 매일 03:00 KST(=18:00 UTC) 호출.
 * `Authorization: Bearer ${CRON_SECRET}` 검증 필수, 미일치 시 401.
 *
 * 동작:
 *   1) DB jobs.expires_at < now() 인 행을 모두 조회
 *   2) 각 잡의 blob_keys[] 를 모두 Blob에서 삭제
 *   3) jobs row 삭제
 *   4) (DB 모드면) cleanup_log 테이블에 결과 기록 — 운영 가시성
 */
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { deleteExpiredJobs, storeMode } from "@/lib/job/store";

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
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET 미설정" },
      { status: 500 }
    );
  }
  if (expected.length < 32) {
    return NextResponse.json(
      { error: "CRON_SECRET too short" },
      { status: 500 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/, "");
  if (!presented || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // M9 심층 방어 — Vercel Cron이 아닌 외부 호출은 차단 (CRON_SECRET 누출 시에도 외부 호출 무효화)
  // production에서만 강제 — 로컬/preview 수동 호출 가능성 보존
  if (
    process.env.NODE_ENV === "production" &&
    req.headers.get("x-vercel-cron") !== "1"
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const start = Date.now();
  const errors: { stage: string; message: string }[] = [];
  let deletedJobs = 0;
  let deletedBlobs = 0;

  try {
    const r = await deleteExpiredJobs();
    deletedJobs = r.deletedIds.length;
    deletedBlobs = r.deletedBlobs.length;
  } catch (err) {
    errors.push({
      stage: "delete_jobs",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 접속 로그 90일 정리 (PRD #0003 §10.6)
  let deletedLogs = 0;
  if (storeMode() === "db") {
    try {
      const { sql } = await import("drizzle-orm");
      const res = await db.execute(
        sql`DELETE FROM login_logs WHERE at < now() - interval '90 days'`
      );
      deletedLogs =
        (res as unknown as { rowCount?: number }).rowCount ?? 0;
    } catch (err) {
      errors.push({
        stage: "delete_login_logs",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // DB 모드일 때만 cleanup_log 기록 (인메모리 폴백에선 무의미)
  if (storeMode() === "db") {
    try {
      await db.insert(schema.cleanupLog).values({
        deletedRows: deletedJobs,
        deletedBlobs,
        errors: errors as unknown as unknown[],
      });
    } catch (err) {
      // cleanup_log 실패는 핵심 동작이 아니므로 응답에만 표시
      errors.push({
        stage: "cleanup_log",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const elapsedMs = Date.now() - start;

  // M9 운영 가시성 — 실패가 있거나 24h 동안 row 없으면 알람 (fire-and-forget)
  if (errors.length > 0 && process.env.ALERT_WEBHOOK_URL) {
    fetch(process.env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `[opr-logistics] cron cleanup errors: ${JSON.stringify(errors)}`,
        deletedJobs,
        deletedBlobs,
        elapsedMs,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: errors.length === 0,
    storeMode: storeMode(),
    deletedJobs,
    deletedBlobs,
    deletedLogs,
    elapsedMs,
    errors,
  });
}
