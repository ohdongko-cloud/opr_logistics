/**
 * GET /api/cron/cleanup — 7일 TTL 자동 삭제 (PRD §4.10 F10 / AC14)
 *
 * Vercel Cron이 매일 03:00 KST 호출.
 * `Authorization: Bearer ${CRON_SECRET}` 검증 필수, 미일치 시 401.
 *
 * M5 인메모리 구현: 만료 잡을 store에서 삭제.
 * M6에서 Neon `jobs` 행 삭제 + Vercel Blob 객체 삭제로 확장.
 */
import { NextResponse } from "next/server";

import { deleteExpiredJobs } from "@/lib/job/store";

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
  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.replace(/^Bearer\s+/, "");
  if (!presented || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const { deletedIds } = deleteExpiredJobs();
  const ms = Date.now() - start;

  // TODO M6: cleanup_log 테이블에 결과 기록 + 24h 동안 row 없으면 알람
  return NextResponse.json({
    ok: true,
    deleted: deletedIds.length,
    elapsedMs: ms,
  });
}
