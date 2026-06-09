/**
 * 3단계 K열 '소스 빈' 분리 규칙 (PRD §4.3 F3 · 사용자 확정)
 *
 * 규칙:
 *   new_sourcebin = K[0:9]            (첫 9문자)
 *   box_no        = K[rfind('-')+1:]  (마지막 하이픈 뒤, 가변 길이)
 *
 * 검증:
 *   - len(K) >= 11
 *   - K[9] === '-'
 *   - rfind('-') > 8 (즉 box_no 영역에 별도 하이픈)
 *
 * 실측 (샘플 188행):
 *   {len 11:7, 12:27, 13:109, 14:45} 모두 K[9]='-' 100% 안전.
 *
 * 예:
 *   'A11-09-03-822'  → newBin='A11-09-03', boxNo='822'
 *   'C03-03-03-3689' → newBin='C03-03-03', boxNo='3689'
 *   'D11-11-02-76'   → newBin='D11-11-02', boxNo='76'
 */

export type SourceBinError =
  | "empty"
  | "too_short"
  | "no_hyphen_at_9"
  | "no_box_separator"
  | "empty_box";

export interface SourceBinSplit {
  ok: boolean;
  newBin: string;
  boxNo: string;
  raw: string;
  reason?: SourceBinError;
}

export function splitSourceBin(
  raw: string | null | undefined
): SourceBinSplit {
  const s = (raw ?? "").toString().trim();
  if (!s) {
    return { ok: false, newBin: "", boxNo: "", raw: s, reason: "empty" };
  }
  if (s.length < 11) {
    return { ok: false, newBin: "", boxNo: "", raw: s, reason: "too_short" };
  }
  if (s[9] !== "-") {
    return {
      ok: false,
      newBin: "",
      boxNo: "",
      raw: s,
      reason: "no_hyphen_at_9",
    };
  }
  const lastHyphen = s.lastIndexOf("-");
  if (lastHyphen <= 8) {
    return {
      ok: false,
      newBin: "",
      boxNo: "",
      raw: s,
      reason: "no_box_separator",
    };
  }
  const newBin = s.slice(0, 9);
  const boxNo = s.slice(lastHyphen + 1);
  if (!boxNo) {
    return { ok: false, newBin, boxNo: "", raw: s, reason: "empty_box" };
  }
  return { ok: true, newBin, boxNo, raw: s };
}

/** 소스빈 첫 글자로 그룹 분류 */
export type BinGroup = "ABC" | "DF" | "ETC_E" | "ETC_OTHER";

export const DEFAULT_GROUPS = {
  ABC: new Set(["A", "B", "C"]),
  DF: new Set(["D", "F"]),
} as const;

export function classifyBin(
  newBin: string,
  groups: { ABC: ReadonlySet<string>; DF: ReadonlySet<string> } = DEFAULT_GROUPS
): BinGroup {
  const first = (newBin?.[0] ?? "").toUpperCase();
  if (groups.ABC.has(first)) return "ABC";
  if (groups.DF.has(first)) return "DF";
  if (first === "E") return "ETC_E";
  return "ETC_OTHER";
}
