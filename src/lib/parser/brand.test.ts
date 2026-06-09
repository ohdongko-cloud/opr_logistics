import { describe, expect, it } from "vitest";
import { cleanBrand } from "./brand";

describe("cleanBrand (PRD §4.2 F2)", () => {
  const cases: Array<[string, string]> = [
    ["로씨로씨(ROCCI ROCCI)", "로씨로씨"],
    ["리오벨 (LIOBELL)", "리오벨"],
    ["캘빈 클라인 진(CALVIN KLEIN JEANS)", "캘빈 클라인 진"],
    ["LF종합관", "LF종합관"],
    ["리바이스", "리바이스"],
    ["아디다스(ADIDAS)", "아디다스"],
    ["뉴발란스", "뉴발란스"],
    ["타미힐피거", "타미힐피거"],
    ["전각（FULL WIDTH）", "전각"],
    ["혼합(ASCII)（전각）", "혼합"],
    ["", ""],
    [" 앞뒤 공백 ", "앞뒤 공백"],
    ["다중   공백", "다중 공백"],
  ];

  it.each(cases)("'%s' → '%s'", (input, expected) => {
    expect(cleanBrand(input)).toBe(expected);
  });

  it("handles null/undefined", () => {
    expect(cleanBrand(null)).toBe("");
    expect(cleanBrand(undefined)).toBe("");
  });

  it("preserves non-paren English (괄호 밖 영문은 손대지 않음)", () => {
    expect(cleanBrand("FILA Korea")).toBe("FILA Korea");
  });
});
