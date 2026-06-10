import { describe, expect, it } from "vitest";
import { sanitizeAoa, sanitizeCell, sanitizeRow } from "./sanitize";

describe("sanitizeCell (CSV/Excel formula injection)", () => {
  it("prefixes dangerous = with '", () => {
    expect(sanitizeCell("=cmd|/c calc")).toBe("'=cmd|/c calc");
  });
  it("prefixes +, -, @, tab, CR, LF", () => {
    expect(sanitizeCell("+1+1")).toBe("'+1+1");
    expect(sanitizeCell("-1-1")).toBe("'-1-1");
    expect(sanitizeCell("@SUM")).toBe("'@SUM");
    expect(sanitizeCell("\t=1")).toBe("'\t=1");
    expect(sanitizeCell("\r=1")).toBe("'\r=1");
  });
  it("leaves safe strings untouched", () => {
    expect(sanitizeCell("로씨로씨")).toBe("로씨로씨");
    expect(sanitizeCell("M1234")).toBe("M1234");
    expect(sanitizeCell("1MBGBK")).toBe("1MBGBK");
  });
  it("leaves numbers/booleans/null untouched", () => {
    expect(sanitizeCell(123)).toBe(123);
    expect(sanitizeCell(true)).toBe(true);
    expect(sanitizeCell(null)).toBe(null);
  });
  it("sanitizes rows and AOA", () => {
    expect(sanitizeRow(["=evil", "ok", 123])).toEqual(["'=evil", "ok", 123]);
    expect(sanitizeAoa([["=a", "b"], ["c", "+d"]])).toEqual([
      ["'=a", "b"],
      ["c", "'+d"],
    ]);
  });
});
