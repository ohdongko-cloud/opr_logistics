import { describe, expect, it } from "vitest";
import { normalize, normalizeForSig } from "./normalize";

describe("normalize", () => {
  it("trims and collapses whitespace", () => {
    expect(normalize("  a   b  ")).toBe("a b");
  });

  it("applies NFKC (full-width → half-width)", () => {
    expect(normalize("ＰＧ Ｎｏ．")).toBe("PG No.");
  });

  it("handles null/undefined → empty string", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
  });
});

describe("normalizeForSig", () => {
  it("strips spaces and punctuation for substring matching", () => {
    expect(normalizeForSig("구매 그룹")).toBe("구매그룹");
    expect(normalizeForSig("PG No.")).toBe("pgno");
    expect(normalizeForSig("자재 그룹 내역")).toBe("자재그룹내역");
  });

  it("survives full-width encoding (NFKC + strip)", () => {
    expect(normalizeForSig("ＰＧ Ｎｏ．")).toBe("pgno");
    expect(normalizeForSig("소스　빈")).toBe("소스빈");
  });

  it("is case-insensitive (lower)", () => {
    expect(normalizeForSig("Plnt")).toBe("plnt");
  });
});
