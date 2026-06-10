/**
 * 단일 파일 업로드 → 검증 → 파싱 → 특정 단계 시트 추출 (PRD #0002 §4.0 F0)
 * #0001 F11 검증을 단계별 업로드에 동일 적용.
 */
import {
  parseWorkbook,
  pickStageFromWorkbook,
  type ParsedSheet,
} from "@/lib/parser/xlsx";
import type { RawStage } from "@/lib/parser/signatures";
import {
  MAX_SINGLE_FILE_BYTES,
  validateFileMeta,
  validateMagic,
} from "@/lib/upload/validate";

export type ParseSingleError =
  | { ok: false; status: number; error: string };
export type ParseSingleOk = {
  ok: true;
  sheet: ParsedSheet;
  filename: string;
};

/**
 * FormData에서 'file' 1개를 꺼내 검증·파싱하고, 기대 단계 시트를 추출.
 * @param expectStage 'stage1' | 'stage2' | 'stage3' | 'stage4'
 */
export async function parseSingleStage(
  formData: FormData,
  expectStage: RawStage
): Promise<ParseSingleOk | ParseSingleError> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, status: 400, error: "file 필드가 필요합니다." };
  }
  const meta = validateFileMeta(file);
  if (!meta.ok) {
    return { ok: false, status: 400, error: meta.detail ?? meta.reason ?? "invalid" };
  }
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    return { ok: false, status: 413, error: "50MB 초과" };
  }
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  const magic = validateMagic(head);
  if (!magic.ok) {
    return { ok: false, status: 400, error: "xlsx 매직바이트 불일치" };
  }
  let sheet: ParsedSheet | null = null;
  try {
    const wb = parseWorkbook(buf);
    sheet = pickStageFromWorkbook(wb, expectStage);
  } catch (err) {
    const detail =
      process.env.NODE_ENV === "production"
        ? "parse_failed"
        : String(err instanceof Error ? err.message : err);
    return { ok: false, status: 400, error: detail };
  }
  if (!sheet) {
    return {
      ok: false,
      status: 422,
      error: `${expectStage} 시트를 인식하지 못했습니다. 올바른 단계 파일인지 확인하세요.`,
    };
  }
  return { ok: true, sheet, filename: file.name };
}
