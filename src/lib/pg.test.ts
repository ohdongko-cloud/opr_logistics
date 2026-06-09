import { describe, expect, it } from "vitest";
import {
  PG_REGEX,
  detectPlantPgConflict,
  isValidPg,
  validatePgInputs,
} from "./pg";

describe("PG_REGEX (^\\d{10}$)", () => {
  it("accepts 10-digit numbers", () => {
    expect(PG_REGEX.test("1000191008")).toBe(true);
  });
  it("rejects 9 or 11 digits", () => {
    expect(PG_REGEX.test("100019100")).toBe(false);
    expect(PG_REGEX.test("10001910080")).toBe(false);
  });
  it("rejects non-digits", () => {
    expect(PG_REGEX.test("100019100A")).toBe(false);
    expect(PG_REGEX.test(" 1000191008")).toBe(false);
  });
});

describe("isValidPg", () => {
  it("returns false for empty/null/undefined", () => {
    expect(isValidPg("")).toBe(false);
    expect(isValidPg(null)).toBe(false);
    expect(isValidPg(undefined)).toBe(false);
  });
  it("returns true for valid 10-digit number", () => {
    expect(isValidPg("1000191008")).toBe(true);
  });
});

describe("validatePgInputs", () => {
  it("returns no issues for valid input", () => {
    const issues = validatePgInputs(["8227"], { "8227": "1000191008" });
    expect(issues).toEqual([]);
  });
  it("flags missing PG", () => {
    const issues = validatePgInputs(["8227"], {});
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("missing");
  });
  it("flags invalid format", () => {
    const issues = validatePgInputs(["8227"], { "8227": "abc" });
    expect(issues[0]?.code).toBe("invalid_format");
  });
});

describe("detectPlantPgConflict", () => {
  it("returns issues when same plant has different PGs", () => {
    const issues = detectPlantPgConflict(
      { "8227": "1000191008" },
      { "8227": "1000191009" }
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plant_inconsistency");
  });
  it("no issue when PGs match", () => {
    const issues = detectPlantPgConflict(
      { "8227": "1000191008" },
      { "8227": "1000191008" }
    );
    expect(issues).toEqual([]);
  });
});
