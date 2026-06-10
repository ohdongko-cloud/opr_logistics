/**
 * GET /api/jobs/[id]/download — 통합 엑셀 다운로드 (PRD §4.9 F9)
 *
 * 시트: RAW1~4 + 출력1·2·3 + ETC 리포트 = 8시트
 * 파일명: {출고지}점_데일리 작업지시서_YYYYMMDD.xlsx
 */
import { NextResponse } from "next/server";

import { checkJobOwnership } from "@/lib/auth/ownership";
import { buildIntegratedWorkbook } from "@/lib/export/xlsx-export";
import { getJob } from "@/lib/job/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  // CSRF/cross-site 방어 — 외부 사이트 링크 클릭으로 인증된 다운로드 차단
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin" && sfs !== "same-site" && sfs !== "none") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const own = await checkJobOwnership(job);
  if (!own.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 출력2·3가 생성된 ready 잡만 다운로드 허용 (부분 잡은 불완전 엑셀 방지)
  if (job.step !== "ready" || !job.data.outputs23) {
    return NextResponse.json(
      { error: "not_ready", detail: "4단계까지 업로드 후 다운로드할 수 있습니다." },
      { status: 409 }
    );
  }

  const { buffer, filename } = buildIntegratedWorkbook({ job });

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
