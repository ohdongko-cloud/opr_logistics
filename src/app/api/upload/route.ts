/**
 * POST /api/upload — RAW 4종 업로드 + 자동 단계 판별 (PRD §4.1 F1)
 *
 * 입력: multipart/form-data, 필드명 'files' (1~4개)
 * 출력: 슬롯 배정 결과 + 시트별 detection
 *
 * NOTE: M2 단계에서는 파일을 메모리에서 파싱만 하고 Blob/Neon에 저장하지 않는다.
 *       (Blob 업로드 + 잡 영속화는 M5에서 추가)
 */

import { NextResponse } from "next/server";

import { parseWorkbook, pickStageFromWorkbook } from "@/lib/parser/xlsx";
import type { RawStage } from "@/lib/parser/signatures";
import { ALL_STAGES } from "@/lib/parser/signatures";
import { assignSlots, type FileDetection } from "@/lib/upload/assign";
import {
  MAX_SINGLE_FILE_BYTES,
  validateFileMeta,
  validateMagic,
  validateTotalSize,
} from "@/lib/upload/validate";

export const runtime = "nodejs";
// 큰 파일 파싱은 시간이 걸릴 수 있음. Vercel Pro 60s, Hobby 10s.
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
    return NextResponse.json(
      { error: "form-data 파싱 실패", detail: String(err) },
      { status: 400 }
    );
  }

  const rawFiles = formData.getAll("files").filter((v): v is File => v instanceof File);
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

  // 1) 메타 / 총용량 검증
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
      return NextResponse.json(
        { error: `${f.name}: 50MB 초과` },
        { status: 413 }
      );
    }
  }

  // 2) 각 파일 파싱 + 단계 판별
  const fileSummaries: FileSummary[] = [];
  const detections: FileDetection[] = [];

  for (let i = 0; i < rawFiles.length; i++) {
    const file = rawFiles[i]!;
    const buf = await file.arrayBuffer();
    // magic byte 검증
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
      continue;
    }

    try {
      const wb = parseWorkbook(buf);
      const sheetSummaries: SheetSummary[] = wb.sheets.map((s) => ({
        sheetName: s.name,
        headerRow: s.headerRow,
        stage: s.detection.stage,
        confidence: s.detection.confidence,
        rowCount: s.rows.length,
      }));

      // 파일 단위 best detection: 가장 높은 confidence
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
            best = { stage: s.detection.stage, confidence: s.detection.confidence };
          }
        }
      }
      // 통합 파일 후보: 4단계 모두 있는지 확인
      const isCombined = ALL_STAGES.every((st) =>
        candidates.some((c) => c.stage === st)
      );

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
        bestStage: isCombined ? best.stage : best.stage,
        bestConfidence: best.confidence,
        stageCandidates: candidates,
      });
    } catch (err) {
      fileSummaries.push({
        fileIndex: i,
        filename: file.name,
        sizeBytes: file.size,
        sheets: [],
        errors: [String(err instanceof Error ? err.message : err)],
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

  // 3) 슬롯 배정
  const assignment = assignSlots(detections);

  // 4) 응답 (각 슬롯에 파싱된 시트 메타 첨부)
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
    // 같은 파일 안에 stage 시트가 둘 이상이면 가장 confidence 높은 것
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
  // pickStageFromWorkbook은 ParsedWorkbook 객체가 필요하지만, 위에서 이미 summary만 들고 있음.
  // 실제 데이터를 들고 다음 단계로 넘기려면 jobs 테이블/blob에 저장 필요 → M5.
  void pickStageFromWorkbook;

  return NextResponse.json({
    files: fileSummaries,
    slots,
    missing: assignment.missing,
    conflicts: assignment.conflicts,
    combinedFileIndex: assignment.combinedFileIndex,
  });
}
