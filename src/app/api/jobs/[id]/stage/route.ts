/**
 * POST /api/jobs/[id]/stage?n=2|3|4 — 단계별 RAW 업로드 (PRD #0002 §4.3/4.6/4.7)
 * multipart/form-data, 필드 'file'
 */
import { NextResponse } from "next/server";

import { checkJobOwnership } from "@/lib/auth/ownership";
import {
  attachStage,
  finalizeJob,
  getJob,
  reuploadStage1,
} from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";
import type { RawStage } from "@/lib/parser/signatures";
import { clientIp, rateLimit, UPLOAD_LIMIT } from "@/lib/rate-limit";
import { parseSingleStage } from "@/lib/upload/parse-single";

export const runtime = "nodejs";
export const maxDuration = 60;

const STAGE_MAP: Record<string, { n: 1 | 2 | 3 | 4; sig: RawStage }> = {
  "1": { n: 1, sig: "stage1" }, // 재업로드(무효화)
  "2": { n: 2, sig: "stage2" },
  "3": { n: 3, sig: "stage3" },
  "4": { n: 4, sig: "stage4" },
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const nParam = url.searchParams.get("n") ?? "";
  const stage = STAGE_MAP[nParam];
  if (!stage) {
    return NextResponse.json({ error: "n must be 1|2|3|4" }, { status: 400 });
  }

  // 레이트리밋 (업로드: IP당 분당 5회)
  const rl = rateLimit(`stage:${clientIp(req)}`, UPLOAD_LIMIT.limit, UPLOAD_LIMIT.windowSeconds);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds ?? 60) } }
    );
  }

  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const own = await checkJobOwnership(job);
  if (!own.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "form_parse_failed" }, { status: 400 });
  }
  const parsed = await parseSingleStage(formData, stage.sig);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // n=1 은 재업로드(무효화 강등)
  if (stage.n === 1) {
    const r = await reuploadStage1(id, parsed.sheet, parsed.filename);
    if (!r.ok) {
      const status = r.error === "conflict" ? 409 : r.error === "not_found" ? 404 : 422;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ view: toJobView(r.job!) });
  }

  const res = await attachStage(id, stage.n, parsed.sheet, parsed.filename);
  if (!res.ok) {
    const status =
      res.error === "not_found" ? 404 : res.error === "conflict" ? 409 : 422;
    return NextResponse.json({ error: res.error }, { status });
  }

  // STEP6(4단계) 첨부 후 자동 finalize → ready (출력2·3 생성)
  let finalJob = res.job!;
  if (stage.n === 4) {
    const fin = await finalizeJob(id);
    if (fin.ok && fin.job) finalJob = fin.job;
  }

  return NextResponse.json({ view: toJobView(finalJob) });
}
