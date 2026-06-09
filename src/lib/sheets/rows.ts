/** 시트 셀 접근 헬퍼들 (null/undefined 안전) */

export type CellValue = string | number | boolean | null;

export function asString(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export function asNumber(v: CellValue | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function readCell(
  row: ReadonlyArray<CellValue>,
  col: number
): CellValue {
  if (col < 0 || col >= row.length) return null;
  return row[col] ?? null;
}
