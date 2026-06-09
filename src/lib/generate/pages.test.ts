import { describe, expect, it } from "vitest";
import { splitPages } from "./pages";
import type { Output2Row } from "./output2";

function row(
  bin: string,
  bokjong: "W" | "M",
  item: string,
  qty = 1
): Output2Row {
  return {
    brand: "B",
    sourceBin: bin,
    boxNo: "001",
    material: `M-${bin}`,
    ean: "E",
    matGroup: `1${bokjong}CA${item}`,
    matGroupName: "n",
    pickQty: qty,
    unpickedQty: "",
    remark: "",
    bokjong,
    item,
  };
}

describe("splitPages", () => {
  it("groups by (복종 × 아이템 × ABC|DF) and skips empty groups", () => {
    const rows = [
      row("A11-09-03", "W", "HH"),
      row("B05-01-02", "W", "HH"),
      row("D11-11-02", "W", "HH"),
      row("A05-02-01", "M", "TC"),
    ];
    const pages = splitPages(rows);
    // M/TC/ABC, W/HH/ABC, W/HH/DF — 3 pages
    expect(pages).toHaveLength(3);
    const labels = pages.map((p) => `${p.bokjong}/${p.item}/${p.group}`);
    expect(labels).toContain("W/HH/ABC");
    expect(labels).toContain("W/HH/DF");
    expect(labels).toContain("M/TC/ABC");
  });

  it("splits into multiple pages when group exceeds pageRowLimit", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(`A11-09-${String(i).padStart(2, "0")}`, "W", "HH")
    );
    const pages = splitPages(rows, { pageRowLimit: 10 });
    expect(pages).toHaveLength(3);
    expect(pages[0]?.groupPagePart).toEqual({ current: 1, total: 3 });
    expect(pages[2]?.groupPagePart).toEqual({ current: 3, total: 3 });
    // pageIndex/total cover the entire job
    expect(pages.every((p) => p.total === 3)).toBe(true);
  });

  it("sorts page rows by sourceBin asc", () => {
    const rows = [
      row("B05-01-01", "W", "HH"),
      row("A11-09-03", "W", "HH"),
      row("C03-03-03", "W", "HH"),
    ];
    const pages = splitPages(rows);
    expect(pages).toHaveLength(1);
    const bins = pages[0]!.rows.map((r) => r.sourceBin);
    expect(bins).toEqual(["A11-09-03", "B05-01-01", "C03-03-03"]);
  });

  it("excludes ETC (E·G~Z) bins", () => {
    const rows = [
      row("E01-01-01", "W", "HH"),
      row("G05-02-03", "W", "HH"),
    ];
    expect(splitPages(rows)).toHaveLength(0);
  });

  it("computes pageQtySum per page", () => {
    const rows = [
      row("A11-09-03", "W", "HH", 5),
      row("B05-01-02", "W", "HH", 3),
      row("D11-11-02", "W", "HH", 7),
    ];
    const pages = splitPages(rows);
    const abc = pages.find((p) => p.group === "ABC");
    const df = pages.find((p) => p.group === "DF");
    expect(abc?.pageQtySum).toBe(8);
    expect(df?.pageQtySum).toBe(7);
  });
});
