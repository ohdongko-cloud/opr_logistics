import { describe, expect, it } from "vitest";
import { cellToText, extractColumn, joinForClipboard } from "./columns";
import type { ParsedSheet } from "@/lib/parser/xlsx";

function sheet(rows: (string | number | null)[][]): ParsedSheet {
  return {
    name: "t",
    headerRow: 1,
    headers: [],
    rows,
    detection: { stage: "stage1", confidence: 1, scores: {} as never, reason: "" },
  };
}

describe("cellToText (값 무손실)", () => {
  it("문자열 선행 0 보존", () => {
    expect(cellToText("0080129")).toBe("0080129");
  });
  it("정수는 지수표기 없이", () => {
    expect(cellToText(8043688126)).toBe("8043688126");
    expect(cellToText(3000173715)).toBe("3000173715");
  });
  it("null/undefined → 빈문자", () => {
    expect(cellToText(null)).toBe("");
    expect(cellToText(undefined)).toBe("");
  });
  it("trim 적용", () => {
    expect(cellToText("  abc  ")).toBe("abc");
  });
});

describe("extractColumn", () => {
  const s = sheet([
    ["A", 100, "x"],
    ["A", 200, "y"],
    ["B", 100, "z"],
    [null, 300, "w"], // 빈 셀 (col0) → 제외
    ["", 400, "v"],
  ]);

  it("distinct 추출 (등장 순서)", () => {
    const r = extractColumn(s, 0, true);
    expect(r.values).toEqual(["A", "B"]);
    expect(r.deduped).toBe(true);
    expect(r.rawCount).toBe(3); // A,A,B (빈셀 2개 제외)
  });

  it("전체 추출 (dedup off)", () => {
    const r = extractColumn(s, 0, false);
    expect(r.values).toEqual(["A", "A", "B"]);
  });

  it("숫자 컬럼 distinct — 문자열 보존", () => {
    const r = extractColumn(s, 1, true);
    expect(r.values).toEqual(["100", "200", "300", "400"]);
  });

  it("빈 셀은 셀 단위로만 제외 (행 스킵 아님)", () => {
    // col0이 빈 행도 col1 추출엔 포함됨
    expect(extractColumn(s, 1, false).values.length).toBe(5);
  });
});

describe("joinForClipboard", () => {
  const v = ["a", "b", "c"];
  it("LF", () => expect(joinForClipboard(v, "LF")).toBe("a\nb\nc"));
  it("CRLF", () => expect(joinForClipboard(v, "CRLF")).toBe("a\r\nb\r\nc"));
  it("TAB_CRLF", () => expect(joinForClipboard(v, "TAB_CRLF")).toBe("a\t\r\nb\t\r\nc"));
  it("기본값 CRLF", () => expect(joinForClipboard(v)).toBe("a\r\nb\r\nc"));
});
