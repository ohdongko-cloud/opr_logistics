import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseWorkbook, pickStageFromWorkbook } from "./xlsx";

/** aoa(헤더+데이터) → 시트명 sheetName 인 xlsx ArrayBuffer */
function buildXlsx(
  sheetName: string,
  aoa: (string | number | null)[][]
): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

// 실측 EXPORT.XLSX(1단계 RAW) 헤더 — 시트명은 "Sheet1"
const STAGE1_HEADERS = [
  "Sts", "Message", "구매 그룹", "구매그룹 내역", "구매 문서", "품목", "납품",
  "품목", "Plnt", "저장 위치", "물류센터", "물류센터 저장위치", "분배번호",
  "분배차수", "분배 지정일", "오리지날 브랜드", "오리지날 브랜드명", "스타일코드",
  "자재", "MC(자재그룹)", "물류재고", "출고진행수량", "미완료납품수량",
  "STO가능수량", "합계", "8227", "오더 단위", "계절년도", "계절", "계절월",
];
const STAGE1_ROW = [
  "", "", "OIA", "여성_OPR", "4522625946", "10", "8043690989", "10", "8227",
  "1000", "1101", "1101", "3000173731", "546", "6/9/26", "I943",
  "로씨로씨(ROCCI ROCCI)", "", "10447320001", "1WCAHH", "68", "0", "12", "56",
  "3", "3", "PC", "2026", "0002", "6",
];

describe("parseWorkbook + pickStageFromWorkbook — 컬럼 기반 인식 (PRD #0002 F0.1)", () => {
  it("시트명이 'Sheet1'이어도 컬럼으로 1단계를 인식한다 (회귀: EXPORT.XLSX)", () => {
    const buf = buildXlsx("Sheet1", [STAGE1_HEADERS, STAGE1_ROW]);
    const wb = parseWorkbook(buf);
    expect(wb.sheets.length).toBe(1);
    expect(wb.sheets[0]!.detection.stage).toBe("stage1");
    const picked = pickStageFromWorkbook(wb, "stage1");
    expect(picked).not.toBeNull();
    expect(picked!.name).toBe("Sheet1");
  });

  it("시트명이 'Sheet2','EXPORT' 등 임의여도 컬럼만 맞으면 인식", () => {
    for (const name of ["Sheet2", "EXPORT", "결과", "data"]) {
      const wb = parseWorkbook(buildXlsx(name, [STAGE1_HEADERS, STAGE1_ROW]));
      expect(pickStageFromWorkbook(wb, "stage1")?.name).toBe(name);
    }
  });

  it("컬럼이 어떤 단계와도 안 맞는 시트(예: 티코드 참조탭)는 선택되지 않는다", () => {
    const junk = [
      ["티코드", "내역", "메뉴", "권한", "비고", "정렬"],
      ["VA01", "판매오더생성", "SD", "Y", "-", "1"],
    ];
    const wb = parseWorkbook(buildXlsx("티코드", junk));
    // 헤더 행은 잡히지만 어떤 stage 시그니처와도 매칭 안 됨
    expect(wb.sheets[0]?.detection.stage).toBeNull();
    expect(pickStageFromWorkbook(wb, "stage1")).toBeNull();
    expect(pickStageFromWorkbook(wb, "stage3")).toBeNull();
  });

  it("헤더 행(비어있지 않은 셀 ≥5)이 없는 시트는 ignored 처리", () => {
    const wb = parseWorkbook(buildXlsx("빈탭", [["a", "b"], ["1", "2"]]));
    expect(wb.sheets.length).toBe(0);
    expect(wb.ignored).toContain("빈탭");
  });
});
