/**
 * GET   /api/jobs/[id]  — 잡 뷰(단계·복사데이터·진행) 조회
 * PATCH /api/jobs/[id]  — 머리글/ETC 편집 (전이 아님)
 *
 * 단계 전이는 전용 라우트: /stage, /pg, /finalize
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkJobOwnership } from "@/lib/auth/ownership";
import { getJob, updateJobMeta } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    headerOverrides: z
      .object({
        docTitle: z.string().max(200).optional(),
        deliveryDate: z.string().max(40).optional(),
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
  if (!own.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ view: toJobView(job) });
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
    const detail =
      process.env.NODE_ENV === "production" ? undefined : parsed.error.flatten();
    return NextResponse.json({ error: "validation", detail }, { status: 400 });
  }
  const res = await updateJobMeta(id, {
    headerOverrides: parsed.data.headerOverrides,
    etcAcknowledged: parsed.data.etcAcknowledged,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });
  return NextResponse.json({ view: toJobView(res.job!) });
}
