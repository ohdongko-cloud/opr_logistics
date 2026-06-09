/**
 * GET /api/jobs/[id]/download — 통합 엑셀 다운로드 (PRD §4.9 F9)
 *
 * 시트: RAW1~4 + 출력1·2·3 + ETC 리포트 = 8시트
 * 파일명: {출고지}점_데일리 작업지시서_YYYYMMDD.xlsx
 */
import { NextResponse } from "next/server";

import { buildIntegratedWorkbook } from "@/lib/export/xlsx-export";
import { getJob } from "@/lib/job/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { buffer, filename } = buildIntegratedWorkbook({
    job,
    rawSheets: job.rawSheets,
  });

  // 파일명에 한글 → RFC 5987 인코딩
  const encoded = encodeURIComponent(filename);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encoded}`,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    },
  });
}
