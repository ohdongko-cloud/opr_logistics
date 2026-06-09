import { describe, expect, it } from "vitest";
import {
  formatDateCompact,
  formatDateDash,
  formatDateDot,
  formatMmDd,
  formatPrintTimestamp,
} from "./dates";

describe("date formatters", () => {
  const d = new Date(2026, 5, 9, 14, 31); // 2026-06-09 14:31

  it("formatDateDot → YYYY.MM.DD", () => {
    expect(formatDateDot(d)).toBe("2026.06.09");
  });
  it("formatDateDash → YYYY-MM-DD", () => {
    expect(formatDateDash(d)).toBe("2026-06-09");
  });
  it("formatDateCompact → YYYYMMDD", () => {
    expect(formatDateCompact(d)).toBe("20260609");
  });
  it("formatMmDd → MMDD", () => {
    expect(formatMmDd(d)).toBe("0609");
  });
  it("formatPrintTimestamp → YYYY-MM-DD/HH:MM AM/PM (12-hour)", () => {
    expect(formatPrintTimestamp(d)).toBe("2026-06-09/02:31 PM");
    expect(formatPrintTimestamp(new Date(2026, 5, 9, 0, 5))).toBe(
      "2026-06-09/12:05 AM"
    );
    expect(formatPrintTimestamp(new Date(2026, 5, 9, 12, 0))).toBe(
      "2026-06-09/12:00 PM"
    );
  });
});
