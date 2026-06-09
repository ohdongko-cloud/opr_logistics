/**
 * RAW 시트 4개를 1개 JSON Blob으로 묶어서 저장/조회 (PRD §4.9 F9 / §4.10 F10)
 *
 * 통합 엑셀 다운로드 시점에 필요. 미리보기/PG 입력 등엔 필요 없으므로 lazy.
 */
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { deleteBlob, getBlobAsJson, putBlob } from "./storage";

export interface JobRawSheets {
  stage1: ParsedSheet;
  stage2: ParsedSheet | null;
  stage3: ParsedSheet;
  stage4: ParsedSheet;
}

/** ParsedSheet의 detection.scores는 객체라 JSON 안전. Date는 ISO 변환 */
function reviveSheet(json: unknown): ParsedSheet {
  return json as ParsedSheet;
}

export async function saveRawSheets(
  jobId: string,
  sheets: JobRawSheets
): Promise<string> {
  const pathname = `jobs/${jobId}/raw-sheets.json`;
  const res = await putBlob(pathname, JSON.stringify(sheets), {
    contentType: "application/json",
  });
  return res.key;
}

export async function loadRawSheets(
  blobKey: string
): Promise<JobRawSheets | null> {
  const data = await getBlobAsJson<{
    stage1: unknown;
    stage2: unknown;
    stage3: unknown;
    stage4: unknown;
  }>(blobKey);
  if (!data) return null;
  return {
    stage1: reviveSheet(data.stage1),
    stage2: data.stage2 ? reviveSheet(data.stage2) : null,
    stage3: reviveSheet(data.stage3),
    stage4: reviveSheet(data.stage4),
  };
}

export async function deleteRawSheets(blobKey: string): Promise<void> {
  await deleteBlob(blobKey);
}
