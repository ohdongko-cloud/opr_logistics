/**
 * POST /api/jobs/[id]/pg — PG번호 입력 → pg_entered 전이 (PRD #0002 §4.4 F4)
 * body: { pgNumbers: { [plnt]: "10자리" } }
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkJobOwnership } from "@/lib/auth/ownership";
import { getJob, setPgNumbers } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";
import { detectPlantPgConflict, validatePgInputs } from "@/lib/pg";

export const runtime = "nodejs";

const Body = z.object({ pgNumbers: z.record(z.string(), z.string()) }).strict();

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const own = await checkJobOwnership(job);
  if (!own.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const detectedPlants = job.data.output1?.detectedPlants ?? [job.plnt];
  const fmtIssues = validatePgInputs(detectedPlants, parsed.data.pgNumbers).filter(
    (i) => i.code !== "missing"
  );
  if (fmtIssues.length > 0) {
    return NextResponse.json({ error: "pg_validation", issues: fmtIssues }, { status: 400 });
  }
  const conflict = detectPlantPgConflict(job.pgNumbers, parsed.data.pgNumbers);
  if (conflict.length > 0) {
    return NextResponse.json({ error: "pg_conflict", issues: conflict }, { status: 409 });
  }

  const res = await setPgNumbers(id, parsed.data.pgNumbers);
  if (!res.ok) {
    const status = res.error === "conflict" ? 409 : res.error === "not_found" ? 404 : 422;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ view: toJobView(res.job!) });
}
