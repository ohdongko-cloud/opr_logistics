/**
 * SheetJS 기반 RAW 엑셀 파싱 + 단계 자동 판별 (PRD §4.1 F1)
 *   - dense 옵션 + 시트당 최대 행수 제한 (50,000) — ZIP bomb/DoS 방어
 *   - 매크로(.xlsm) 거부, 외부 링크 거부
 *   - 헤더 자동 탐지: 비어있지 않은 셀이 5개 이상인 첫 행
 */
import * as XLSX from "xlsx";

import { detectStage, type DetectionResult } from "./detect";
import type { RawStage } from "./signatures";

/** 시트 1개의 파싱 결과 */
export interface ParsedSheet {
  name: string;
  /** 1-based 헤더 행 번호 */
  headerRow: number;
  /** 헤더 셀 문자열 배열 (빈 셀은 "") */
  headers: string[];
  /** 데이터 행 — 셀 값을 (원시 타입 또는 null)로 노출 */
  rows: (string | number | boolean | null)[][];
  /** 자동 판별 결과 */
  detection: DetectionResult;
}

export interface ParsedWorkbook {
  /** 무시되지 않은 시트들 */
  sheets: ParsedSheet[];
  /** 무시된 시트들 (티코드 등) */
  ignored: string[];
}

const MAX_ROWS_PER_SHEET = 50_000;
/** 무시할 시트명 패턴 — PRD F1.4 */
const IGNORED_SHEET_PATTERNS: RegExp[] = [
  /^티코드$/,
  /^sheet\d*$/i,
  /^[\s\-_]*$/, // 빈 이름/구분자만
];

function isIgnoredSheet(name: string): boolean {
  const trimmed = name.trim();
  return IGNORED_SHEET_PATTERNS.some((re) => re.test(trimmed));
}

export interface ParseOptions {
  /** 시트당 최대 행수 (기본 50,000) — 초과 시 throw */
  maxRows?: number;
}

export function parseWorkbook(
  buffer: ArrayBuffer | Uint8Array,
  opts: ParseOptions = {}
): ParsedWorkbook {
  const maxRows = opts.maxRows ?? MAX_ROWS_PER_SHEET;

  const wb = XLSX.read(buffer, {
    type: "array",
    dense: true,
    cellDates: true,
    cellText: false,
  });

  // 보안: 매크로/외부 링크 거부 (PRD §4.11 F11)
  const wbProps = wb.Workbook?.WBProps as
    | { codeName?: string }
    | undefined;
  if (wbProps?.codeName) {
    throw new Error("매크로(.xlsm) 워크북은 허용되지 않습니다.");
  }
  // ExtLinks는 SheetJS 타입에 없지만 일부 워크북에서 존재. any로 검사.
  const extLinks = (wb.Workbook as unknown as { ExtLinks?: unknown[] })
    ?.ExtLinks;
  if (Array.isArray(extLinks) && extLinks.length > 0) {
    throw new Error("외부 링크가 포함된 워크북은 허용되지 않습니다.");
  }

  const sheets: ParsedSheet[] = [];
  const ignored: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (isIgnoredSheet(sheetName)) {
      ignored.push(sheetName);
      continue;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // M9: OOM 사전 차단 — sheet_to_json 호출 *전* 에 시트 ref로 행 수 확인.
    // ZIP bomb으로 sheet_to_json이 수십 GB 객체를 만드는 것을 막는다.
    const ref = ws["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      const declaredRows = range.e.r - range.s.r + 1;
      if (declaredRows > maxRows) {
        throw new Error(
          `시트 '${sheetName}'의 행 수가 ${declaredRows}로 상한 ${maxRows}을 초과합니다.`
        );
      }
    }

    const rawRows = XLSX.utils.sheet_to_json<
      (string | number | boolean | null)[]
    >(ws, { header: 1, defval: null, raw: false, blankrows: false });

    if (rawRows.length > maxRows) {
      throw new Error(
        `시트 '${sheetName}'의 실제 행 수가 ${rawRows.length}로 상한 ${maxRows}을 초과합니다.`
      );
    }

    // 헤더 탐지: 5개 이상의 비어있지 않은 셀을 가진 첫 행
    let headerRowIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i] ?? [];
      const nonEmpty = row.filter(
        (v) => v !== null && v !== undefined && String(v).trim() !== ""
      );
      if (nonEmpty.length >= 5) {
        headerRowIdx = i;
        headers = row.map((v) =>
          v === null || v === undefined ? "" : String(v)
        );
        break;
      }
    }
    if (headerRowIdx < 0) {
      ignored.push(sheetName);
      continue;
    }

    const dataRows = rawRows
      .slice(headerRowIdx + 1)
      .filter((r) =>
        r.some((c) => c !== null && c !== undefined && String(c).trim() !== "")
      );

    sheets.push({
      name: sheetName,
      headerRow: headerRowIdx + 1,
      headers,
      rows: dataRows,
      detection: detectStage(headers),
    });
  }

  return { sheets, ignored };
}

/** 통합 1개 파일(여러 시트가 1~4단계 모두 포함)에서 단계별로 매핑 */
export function pickStageFromWorkbook(
  wb: ParsedWorkbook,
  stage: RawStage
): ParsedSheet | null {
  const exact = wb.sheets.filter((s) => s.detection.stage === stage);
  if (exact.length === 0) return null;
  if (exact.length === 1) return exact[0]!;
  // 같은 단계가 여러 시트에 매칭되면 confidence 높은 것 우선.
  exact.sort((a, b) => b.detection.confidence - a.detection.confidence);
  return exact[0]!;
}
