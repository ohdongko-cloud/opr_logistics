/**
 * GET    /api/jobs/[id]  — 잡 조회 (요약)
 * PATCH  /api/jobs/[id]  — pgNumbers / headerOverrides 부분 업데이트
 *
 * M5 인메모리 store. M6에서 Neon으로 교체.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkJobOwnership } from "@/lib/auth/ownership";
import { getJob, updateJob } from "@/lib/job/store";
import { detectPlantPgConflict, validatePgInputs } from "@/lib/pg";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    pgNumbers: z.record(z.string(), z.string()).optional(),
    headerOverrides: z
      .object({
        docTitle: z.string().max(200).optional(),
        deliveryDate: z.string().max(20).optional(),
        footerLeft: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    etcAcknowledged: z.boolean().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const own = await checkJobOwnership(job);
  // IDOR 차단 — 존재 여부 누출 방지를 위해 403 대신 404로 응답
  if (!own.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    id: job.id,
    plnt: job.plnt,
    outletName: job.outletName,
    sourceFilenames: job.sourceFilenames,
    pgNumbers: job.pgNumbers,
    headerOverrides: job.headerOverrides,
    detectedPlants: job.processed.detectedPlants,
    pageCount: job.processed.pages.length,
    etcCount: job.processed.etc.length,
    warningsCount: job.processed.warnings.length,
    totals: job.processed.totals,
    expiresAt: job.expiresAt.toISOString(),
  });
}

export async function PATCH(
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    // 운영에선 detail 노출 금지 (내부 필드 누출 회피)
    const detail =
      process.env.NODE_ENV === "production"
        ? undefined
        : parsed.error.flatten();
    return NextResponse.json(
      { error: "validation", detail },
      { status: 400 }
    );
  }

  // PG 검증: 정규식 + 플랜트 일관성
  if (parsed.data.pgNumbers) {
    const formatIssues = validatePgInputs(
      job.processed.detectedPlants,
      parsed.data.pgNumbers
    ).filter((i) => i.code !== "missing"); // 부분 업데이트라 missing은 허용
    if (formatIssues.length > 0) {
      return NextResponse.json(
        { error: "pg_validation", issues: formatIssues },
        { status: 400 }
      );
    }
    const conflictIssues = detectPlantPgConflict(
      job.pgNumbers,
      parsed.data.pgNumbers
    );
    if (conflictIssues.length > 0) {
      return NextResponse.json(
        { error: "pg_conflict", issues: conflictIssues },
        { status: 409 }
      );
    }
  }

  const updated = await updateJob(id, {
    pgNumbers: parsed.data.pgNumbers,
    headerOverrides: parsed.data.headerOverrides,
    etcAcknowledged: parsed.data.etcAcknowledged,
  });

  return NextResponse.json({
    id: updated!.id,
    pgNumbers: updated!.pgNumbers,
    headerOverrides: updated!.headerOverrides,
  });
}
