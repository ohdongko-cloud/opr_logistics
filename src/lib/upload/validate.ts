/**
 * 업로드 파일 검증 (PRD §4.11 F11)
 *   - 단일 파일 50MB / 총 100MB
 *   - 확장자 .xlsx (대문자 허용)
 *   - magic byte PK\x03\x04 (xlsx = ZIP 컨테이너)
 *   - 일부 보안 정책은 parseWorkbook 내부에서 (매크로/외부링크)
 */

export const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB

const XLSX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04"

export type FileValidationError =
  | "too_large"
  | "bad_extension"
  | "bad_magic"
  | "empty";

export interface FileValidationResult {
  ok: boolean;
  reason?: FileValidationError;
  detail?: string;
}

export function validateFileMeta(file: {
  name: string;
  size: number;
}): FileValidationResult {
  if (file.size === 0) return { ok: false, reason: "empty" };
  if (file.size > MAX_SINGLE_FILE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      detail: `파일 ${(file.size / 1024 / 1024).toFixed(1)}MB > 상한 50MB`,
    };
  }
  const ext = file.name.toLowerCase();
  if (!ext.endsWith(".xlsx")) {
    return {
      ok: false,
      reason: "bad_extension",
      detail: ".xlsx 파일만 허용됩니다.",
    };
  }
  return { ok: true };
}

export function validateMagic(head: Uint8Array): FileValidationResult {
  if (head.length < 4) return { ok: false, reason: "bad_magic" };
  for (let i = 0; i < 4; i++) {
    if (head[i] !== XLSX_MAGIC[i]) {
      return { ok: false, reason: "bad_magic", detail: "ZIP 매직바이트 불일치" };
    }
  }
  return { ok: true };
}

export function validateTotalSize(
  files: ReadonlyArray<{ size: number }>
): FileValidationResult {
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      detail: `총 업로드 ${(total / 1024 / 1024).toFixed(1)}MB > 상한 100MB`,
    };
  }
  return { ok: true };
}
