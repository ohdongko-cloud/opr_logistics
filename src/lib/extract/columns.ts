/**
 * 단계별 SAP 붙여넣기용 컬럼 추출 (PRD #0002 §4.2 F2 / §4.9 F9)
 *
 * 원칙:
 *  - 값은 원본 문자열 보존 (숫자 변환 금지 — 선행 0/지수표기/소수점 오염 방지)
 *  - 셀 단위 추출 (행 스킵 아님): 해당 컬럼의 비공백 값만
 *  - distinct 옵션 (등장 순서 유지)
 */
import type { ParsedSheet } from "@/lib/parser/xlsx";

/** 셀 값을 SAP 안전 문자열로: 숫자/날짜라도 원본 표현 유지, trim만 */
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  // 이미 문자열이면 그대로 (선행 0 보존)
  if (typeof v === "string") return v.trim();
  // 숫자는 지수표기/소수점 오염 방지 — 정수면 정수 문자열
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  // Date 등은 ISO 앞부분
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export interface ColumnExtraction {
  /** 추출된 값들 (순서 유지) */
  values: string[];
  /** distinct 적용 여부 */
  deduped: boolean;
  /** 원본 비공백 셀 개수 (중복 포함) */
  rawCount: number;
}

/**
 * 시트의 특정 컬럼(0-based index)에서 값을 추출.
 * @param dedup true면 distinct(등장 순서 유지)
 */
export function extractColumn(
  sheet: ParsedSheet,
  colIndex: number,
  dedup: boolean
): ColumnExtraction {
  const all: string[] = [];
  for (const row of sheet.rows) {
    if (colIndex < 0 || colIndex >= row.length) continue;
    const text = cellToText(row[colIndex]);
    if (text === "") continue;
    all.push(text);
  }
  if (!dedup) {
    return { values: all, deduped: false, rawCount: all.length };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of all) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return { values: out, deduped: true, rawCount: all.length };
}

export type NewlineFormat = "LF" | "CRLF" | "TAB_CRLF";

/** SAP 붙여넣기용 텍스트로 직렬화 */
export function joinForClipboard(
  values: ReadonlyArray<string>,
  fmt: NewlineFormat = "CRLF"
): string {
  const sep = fmt === "LF" ? "\n" : fmt === "CRLF" ? "\r\n" : "\t\r\n";
  return values.join(sep);
}
