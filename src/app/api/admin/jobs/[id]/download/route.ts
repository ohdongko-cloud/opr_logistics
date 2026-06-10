/**
 * GET /api/admin/jobs/[id]/download — admin 전용 잡 다운로드 (소유권 무관).
 * requireAdmin. ready 잡만.
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import { buildIntegratedWorkbook } from "@/lib/export/xlsx-export";
import { getJob } from "@/lib/job/store";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin" && sfs !== "same-site" && sfs !== "none") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.step !== "ready" || !job.data.outputs23) {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }
  const { buffer, filename } = buildIntegratedWorkbook({ job });
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
