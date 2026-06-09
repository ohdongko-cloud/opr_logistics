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
import { generateOutput3 } from "./output3";

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
    // 정렬 검증
    for (let i = 1; i < out.rows.length; i++) {
      expect(
        out.rows[i]!.sourceBin.localeCompare(out.rows[i - 1]!.sourceBin)
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
