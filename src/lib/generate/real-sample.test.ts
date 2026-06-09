/**
 * 실데이터 통합 테스트 (AC3 / AC4 / AC11 검증)
 *
 * 첨부 샘플 `C:\Users\oh_dongha01\Desktop\1단계_STO대량생성(1).XLSX` 가 있을 때만 실행.
 * 없으면 skip.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseWorkbook, pickStageFromWorkbook } from "@/lib/parser/xlsx";
import { generateOutput1 } from "./output1";
import { generateOutput2 } from "./output2";
import { generateOutput3 } from "./output3";
import { splitPages } from "./pages";
import { processJob } from "./process";

const SAMPLE = "C:\\Users\\oh_dongha01\\Desktop\\1단계_STO대량생성(1).XLSX";

const skip = !existsSync(SAMPLE);

describe.skipIf(skip)("real-sample integration", () => {
  const buf = !skip ? readFileSync(SAMPLE) : null;

  it("parses sample workbook and detects 4 stages", () => {
    const wb = parseWorkbook(buf!);
    expect(wb.sheets.length).toBeGreaterThan(0);
    expect(pickStageFromWorkbook(wb, "stage1")).not.toBeNull();
    expect(pickStageFromWorkbook(wb, "stage2")).not.toBeNull();
    expect(pickStageFromWorkbook(wb, "stage3")).not.toBeNull();
    expect(pickStageFromWorkbook(wb, "stage4")).not.toBeNull();
  });

  it("AC3: SUM(출력1.수량) == SUM(1단계.Y열) == 415", () => {
    const wb = parseWorkbook(buf!);
    const s1 = pickStageFromWorkbook(wb, "stage1");
    expect(s1).not.toBeNull();
    const out = generateOutput1(s1!, (p) => (p === "8227" ? "강서" : null));
    const sumRows = out.rows.reduce((s, r) => s + r.qty, 0);
    expect(out.totalQty).toBe(415);
    expect(sumRows).toBe(415);
    // 모든 행이 강서점 / 출고지 정의되어야 함
    expect(out.rows.every((r) => r.outletName === "강서")).toBe(true);
    // 브랜드는 모두 정제(괄호 영문 제거)
    expect(out.rows.every((r) => !/[()]/.test(r.brand))).toBe(true);
  });

  it("AC4: 출력3 행 수 == distinct (자재코드 → 새 소스빈) 쌍 개수에 가까움", () => {
    const wb = parseWorkbook(buf!);
    const s1 = pickStageFromWorkbook(wb, "stage1");
    const s3 = pickStageFromWorkbook(wb, "stage3");
    expect(s1).not.toBeNull();
    expect(s3).not.toBeNull();
    const out = generateOutput3(s1!, s3!, {
      outletName: "강서점",
      date: "2026.06.09",
    });
    // 샘플은 ETC 0건 — 188행 → distinct (브랜드, newBin) ≤ 188
    expect(out.etcRows.length).toBe(0);
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.rows.length).toBeLessThanOrEqual(188);
    for (let i = 1; i < out.rows.length; i++) {
      expect(
        out.rows[i]!.sourceBin.localeCompare(out.rows[i - 1]!.sourceBin)
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("AC12: SUM(출력2.피킹수량) == SUM(1단계.Y열) == 415", () => {
    const wb = parseWorkbook(buf!);
    const s1 = pickStageFromWorkbook(wb, "stage1");
    const s3 = pickStageFromWorkbook(wb, "stage3");
    const s4 = pickStageFromWorkbook(wb, "stage4");
    const out = generateOutput2(s1!, s3!, s4!);
    expect(out.totalPickQty).toBe(415);
    // 모든 행이 W/M 화이트리스트 통과
    expect(
      out.rows.every((r) => r.bokjong === "W" || r.bokjong === "M")
    ).toBe(true);
    // 모든 행이 아이템 2글자
    expect(out.rows.every((r) => r.item.length === 2)).toBe(true);
    // 분리 키 중복 없음
    const keys = new Set(out.rows.map((r) => `${r.material}|${r.sourceBin}|${r.boxNo}`));
    expect(keys.size).toBe(out.rows.length);
  });

  it("AC6: 페이지 분할 = (복종×아이템×{ABC,DF}) - 빈 그룹", () => {
    const wb = parseWorkbook(buf!);
    const s1 = pickStageFromWorkbook(wb, "stage1");
    const s3 = pickStageFromWorkbook(wb, "stage3");
    const s4 = pickStageFromWorkbook(wb, "stage4");
    const out = generateOutput2(s1!, s3!, s4!);
    const pages = splitPages(out.rows);
    // 페이지 수 > 0, 모든 페이지가 W/M
    expect(pages.length).toBeGreaterThan(0);
    for (const p of pages) {
      expect(["W", "M"]).toContain(p.bokjong);
      expect(["ABC", "DF"]).toContain(p.group);
      // 페이지 내 정렬: 소스빈 오름차순
      for (let i = 1; i < p.rows.length; i++) {
        expect(
          p.rows[i]!.sourceBin.localeCompare(p.rows[i - 1]!.sourceBin)
        ).toBeGreaterThanOrEqual(0);
      }
    }
    // 페이지 합계 == 출력2 합계 == 415
    const pageSum = pages.reduce((s, p) => s + p.pageQtySum, 0);
    expect(pageSum).toBe(415);
  });

  it("processJob orchestrator: 모든 출력 + 합계 정합성", () => {
    const wb = parseWorkbook(buf!);
    const job = processJob({
      stage1: pickStageFromWorkbook(wb, "stage1")!,
      stage3: pickStageFromWorkbook(wb, "stage3")!,
      stage4: pickStageFromWorkbook(wb, "stage4")!,
      outletResolver: (p) => (p === "8227" ? "강서" : null),
      today: new Date(2026, 5, 9, 14, 31),
    });
    expect(job.totals.stage1Y).toBe(415);
    expect(job.totals.output1Qty).toBe(415);
    expect(job.totals.output2PickQty).toBe(415);
    expect(job.detectedPlants).toEqual(["8227"]);
    expect(job.outletName).toBe("강서");
    expect(job.pages.length).toBeGreaterThan(0);
  });
});
