import { describe, expect, it } from "vitest";
import { extractMatGroup } from "./matgroup";

describe("extractMatGroup (PRD §4.4 F4)", () => {
  it("extracts from '1MBGBK' → M, BK", () => {
    const r = extractMatGroup("1MBGBK");
    expect(r.ok).toBe(true);
    expect(r.bokjong).toBe("M");
    expect(r.item).toBe("BK");
  });

  it("extracts from '1WCAHH' → W, HH", () => {
    const r = extractMatGroup("1WCAHH");
    expect(r.ok).toBe(true);
    expect(r.bokjong).toBe("W");
    expect(r.item).toBe("HH");
  });

  it("extracts from '2MBGBK' (prefix variants) → M, BK", () => {
    const r = extractMatGroup("2MBGBK");
    expect(r.ok).toBe(true);
    expect(r.bokjong).toBe("M");
    expect(r.item).toBe("BK");
  });

  it("rejects short codes (length < 3)", () => {
    expect(extractMatGroup("M").ok).toBe(false);
    expect(extractMatGroup("WX").ok).toBe(false);
  });

  it("rejects invalid bokjong (not W/M)", () => {
    const r = extractMatGroup("1XCATC"); // [1]='X'
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_bokjong");
    expect(r.item).toBe("TC"); // 아이템은 추출 가능
  });

  it("handles null/empty", () => {
    expect(extractMatGroup("").ok).toBe(false);
    expect(extractMatGroup(null).ok).toBe(false);
  });

  it("is case-insensitive on bokjong", () => {
    expect(extractMatGroup("1mBGBK").bokjong).toBe("M");
    expect(extractMatGroup("1wCAHH").bokjong).toBe("W");
  });
});
