/**
 * POST /api/upload — RAW 4종 업로드 + 자동 단계 판별 + 잡 처리 (PRD §4.1·§4.4·§4.5)
 *
 * 입력: multipart/form-data, 필드명 'files' (1~4개)
 * 동작:
 *   1. 메타/매직바이트 검증
 *   2. 각 파일 파싱 → 단계 자동 판별
 *   3. 4 슬롯 배정. 4단계 모두 채워지면 processJob 실행 + 인메모리 잡 저장
 *   4. 응답에 jobId / slots / 합계 검증 포함
 *
 * M5에서 Neon + Vercel Blob 영속화로 교체.
 */
import { NextResponse } from "next/server";

import { getCurrentEmail } from "@/lib/auth/session";
import { processJob } from "@/lib/generate/process";
import { staticOutletResolver } from "@/lib/job/plants";
import { createJob } from "@/lib/job/store";
import { ALL_STAGES, type RawStage } from "@/lib/parser/signatures";
import {
  parseWorkbook,
  pickStageFromWorkbook,
  type ParsedWorkbook,
} from "@/lib/parser/xlsx";
import { assignSlots, type FileDetection } from "@/lib/upload/assign";
import {
  MAX_SINGLE_FILE_BYTES,
  validateFileMeta,
  validateMagic,
  validateTotalSize,
} from "@/lib/upload/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SheetSummary {
  sheetName: string;
  headerRow: number;
  stage: RawStage | null;
  confidence: number;
  rowCount: number;
}

interface FileSummary {
  fileIndex: number;
  filename: string;
  sizeBytes: number;
  sheets: SheetSummary[];
  errors: string[];
}

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    // 운영에선 detail 노출 금지 (multipart parser 내부 경로/스택 누출 회피)
    const detail =
      process.env.NODE_ENV === "production" ? undefined : String(err);
    return NextResponse.json(
      { error: "form-data 파싱 실패", detail },
      { status: 400 }
    );
  }

  const rawFiles = formData
    .getAll("files")
    .filter((v): v is File => v instanceof File);
  if (rawFiles.length === 0) {
    return NextResponse.json(
      { error: "files 필드에 .xlsx 파일이 1개 이상 필요합니다." },
      { status: 400 }
    );
  }
  if (rawFiles.length > 4) {
    return NextResponse.json(
      { error: "최대 4개 파일까지 업로드할 수 있습니다." },
      { status: 400 }
    );
  }

  const totalCheck = validateTotalSize(rawFiles.map((f) => ({ size: f.size })));
  if (!totalCheck.ok) {
    return NextResponse.json(
      { error: totalCheck.detail ?? totalCheck.reason },
      { status: 413 }
    );
  }
  for (const f of rawFiles) {
    const meta = validateFileMeta(f);
    if (!meta.ok) {
      return NextResponse.json(
        { error: `${f.name}: ${meta.detail ?? meta.reason}` },
        { status: 400 }
      );
    }
    if (f.size > MAX_SINGLE_FILE_BYTES) {
      return NextResponse.json({ error: `${f.name}: 50MB 초과` }, { status: 413 });
    }
  }

  const fileSummaries: FileSummary[] = [];
  const detections: FileDetection[] = [];
  const workbooks: (ParsedWorkbook | null)[] = [];

  for (let i = 0; i < rawFiles.length; i++) {
    const file = rawFiles[i]!;
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    const magic = validateMagic(head);
    if (!magic.ok) {
      fileSummaries.push({
        fileIndex: i,
        filename: file.name,
        sizeBytes: file.size,
        sheets: [],
        errors: [`magic_invalid: ${magic.detail ?? magic.reason}`],
      });
      detections.push({
        fileIndex: i,
        filename: file.name,
        bestStage: null,
        bestConfidence: 0,
        stageCandidates: [],
      });
      workbooks.push(null);
      continue;
    }
    try {
      const wb = parseWorkbook(buf);
      workbooks.push(wb);
      const sheetSummaries: SheetSummary[] = wb.sheets.map((s) => ({
        sheetName: s.name,
        headerRow: s.headerRow,
        stage: s.detection.stage,
        confidence: s.detection.confidence,
        rowCount: s.rows.length,
      }));
      let best: { stage: RawStage | null; confidence: number } = {
        stage: null,
        confidence: 0,
      };
      const candidates: FileDetection["stageCandidates"] = [];
      for (const s of wb.sheets) {
        if (s.detection.stage) {
          candidates.push({
            stage: s.detection.stage,
            confidence: s.detection.confidence,
            sheetName: s.name,
          });
          if (s.detection.confidence > best.confidence) {
            best = {
              stage: s.detection.stage,
              confidence: s.detection.confidence,
            };
          }
        }
      }
      fileSummaries.push({
        fileIndex: i,
        filename: file.name,
        sizeBytes: file.size,
        sheets: sheetSummaries,
        errors: [],
      });
      detections.push({
        fileIndex: i,
        filename: file.name,
        bestStage: best.stage,
        bestConfidence: best.confidence,
        stageCandidates: candidates,
      });
    } catch (err) {
      workbooks.push(null);
      const errMsg =
        process.env.NODE_ENV === "production"
          ? "parse_failed"
          : String(err instanceof Error ? err.message : err);
      // 서버 로그에는 상세 보관 (PII 마스킹)
      console.error("[upload] parse error", {
        fileIndex: i,
        filename: file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_"),
        message: err instanceof Error ? err.message : String(err),
      });
      fileSummaries.push({
        fileIndex: i,
        filename: file.name,
        sizeBytes: file.size,
        sheets: [],
        errors: [errMsg],
      });
      detections.push({
        fileIndex: i,
        filename: file.name,
        bestStage: null,
        bestConfidence: 0,
        stageCandidates: [],
      });
    }
  }

  const assignment = assignSlots(detections);

  const slots: Record<
    RawStage,
    { fileIndex: number | null; sheetName: string | null; rowCount: number | null }
  > = {
    stage1: { fileIndex: null, sheetName: null, rowCount: null },
    stage2: { fileIndex: null, sheetName: null, rowCount: null },
    stage3: { fileIndex: null, sheetName: null, rowCount: null },
    stage4: { fileIndex: null, sheetName: null, rowCount: null },
  };

  for (const stage of ALL_STAGES) {
    const fi = assignment.assignment[stage];
    if (fi === undefined) continue;
    const summary = fileSummaries[fi];
    if (!summary) continue;
    const sheet = summary.sheets
      .filter((s) => s.stage === stage)
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (sheet) {
      slots[stage] = {
        fileIndex: fi,
        sheetName: sheet.sheetName,
        rowCount: sheet.rowCount,
      };
    }
  }

  // 모든 슬롯이 채워졌다면 잡 처리 + 인메모리 저장
  let jobId: string | null = null;
  let totals: { stage1Y: number; output1Qty: number; output2PickQty: number } | null =
    null;
  let warnings: string[] = [];

  if (assignment.missing.length === 0) {
    try {
      const s1 = pickStageFromWorkbook(workbooks[slots.stage1.fileIndex!]!, "stage1");
      const s3 = pickStageFromWorkbook(workbooks[slots.stage3.fileIndex!]!, "stage3");
      const s4 = pickStageFromWorkbook(workbooks[slots.stage4.fileIndex!]!, "stage4");
      const s2 =
        slots.stage2.fileIndex !== null
          ? pickStageFromWorkbook(workbooks[slots.stage2.fileIndex]!, "stage2")
          : null;
      if (s1 && s3 && s4) {
        const processed = processJob({
          stage1: s1,
          stage3: s3,
          stage4: s4,
          outletResolver: staticOutletResolver,
        });
        const plnt = processed.detectedPlants[0] ?? "8227";
        const createdByEmail = await getCurrentEmail();
        const job = await createJob({
          plnt,
          outletName: processed.outletName,
          sourceFilenames: rawFiles.map((f) => f.name),
          detectedSheets: {
            stage1: slots.stage1.sheetName,
            stage2: slots.stage2.sheetName,
            stage3: slots.stage3.sheetName,
            stage4: slots.stage4.sheetName,
          },
          processed,
          rawSheets: { stage1: s1, stage2: s2, stage3: s3, stage4: s4 },
          createdByEmail,
        });
        jobId = job.id;
        totals = processed.totals;
        warnings = processed.warnings;
      }
    } catch (err) {
      console.error("[upload] job processing failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      // 운영에선 상세 노출 금지
      warnings.push("잡 처리 실패");
    }
  }

  return NextResponse.json({
    jobId,
    files: fileSummaries,
    slots,
    missing: assignment.missing,
    conflicts: assignment.conflicts,
    combinedFileIndex: assignment.combinedFileIndex,
    totals,
    warnings,
  });
}
