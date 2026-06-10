/**
 * POST /api/jobs — STEP1: 1단계(STO) 업로드 → 잡 부분 생성 (PRD #0002 §4.2 F2)
 * multipart/form-data, 필드 'file'
 */
import { NextResponse } from "next/server";

import { getCurrentEmail } from "@/lib/auth/session";
import { createJobAtStep1 } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";
import { resolveStage1 } from "@/lib/sheets/columns";
import { asString, readCell } from "@/lib/sheets/rows";
import { parseSingleStage } from "@/lib/upload/parse-single";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "form_parse_failed" }, { status: 400 });
  }
  const parsed = await parseSingleStage(formData, "stage1");
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  // 플랜트 추출 (1단계 Plnt 컬럼 첫 비공백)
  const cols = resolveStage1(parsed.sheet.headers);
  let plnt = "8227";
  if (cols.plnt >= 0) {
    for (const row of parsed.sheet.rows) {
      const v = asString(readCell(row, cols.plnt));
      if (v) {
        plnt = v;
        break;
      }
    }
  }

  const email = await getCurrentEmail();
  const job = await createJobAtStep1({
    stage1: parsed.sheet,
    sourceFilename: parsed.filename,
    plnt,
    createdByEmail: email,
  });
  return NextResponse.json({ jobId: job.id, view: toJobView(job) });
}
