/**
 * POST /api/jobs — STEP1: 1단계(STO) 업로드 → 잡 부분 생성 (PRD #0002 §4.2 F2)
 * multipart/form-data, 필드 'file'
 */
import { NextResponse } from "next/server";

import { getCurrentEmail } from "@/lib/auth/session";
import { createJobAtStep1 } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";
import { clientIp, rateLimit, UPLOAD_LIMIT } from "@/lib/rate-limit";
import { resolveStage1 } from "@/lib/sheets/columns";
import { asString, readCell } from "@/lib/sheets/rows";
import { parseSingleStage } from "@/lib/upload/parse-single";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rl = rateLimit(`jobcreate:${clientIp(req)}`, UPLOAD_LIMIT.limit, UPLOAD_LIMIT.windowSeconds);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds ?? 60) } }
    );
  }
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
  try {
    const job = await createJobAtStep1({
      stage1: parsed.sheet,
      sourceFilename: parsed.filename,
      plnt,
      createdByEmail: email,
    });
    return NextResponse.json({ jobId: job.id, view: toJobView(job) });
  } catch (err) {
    // 잡 생성 실패(blob 쓰기/DB insert/스키마 불일치 등)를 불투명한 500으로 두지 않는다.
    // 상세는 서버 로그(Vercel Functions)로만, 사용자에겐 안정적 코드만 노출(내부정보 누출 방지).
    console.error("[POST /api/jobs] job create failed:", err);
    return NextResponse.json({ error: "job_create_failed" }, { status: 500 });
  }
}
