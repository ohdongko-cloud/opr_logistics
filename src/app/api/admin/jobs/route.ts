/** GET /api/admin/jobs — 전체 작업 이력 (PRD #0003 §5.4). requireAdmin. */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import { listAllJobs } from "@/lib/job/store";

export const runtime = "nodejs";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const jobs = await listAllJobs(200);
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      plnt: j.plnt,
      step: j.step,
      createdByEmail: j.createdByEmail,
      sourceFilenames: j.sourceFilenames,
      createdAt: j.createdAt.toISOString(),
      expiresAt: j.expiresAt.toISOString(),
      downloadable: j.step === "ready",
    })),
  });
}
