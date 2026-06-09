import { describe, expect, it } from "vitest";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { generateOutput3 } from "./output3";

function buildStage1(materials: Array<{ mat: string; brand: string }>): ParsedSheet {
  const headers = [
    "Sts",
    "Message",
    "구매 그룹",
    "구매그룹 내역",
    "구매 문서",
    "품목",
    "납품",
    "품목",
    "Plnt",
    "저장 위치",
    "물류센터",
    "물류센터 저장위치",
    "분배번호",
    "분배차수",
    "분배 지정일",
    "오리지날 브랜드",
    "오리지날 브랜드명",
    "스타일코드",
    "자재",
    "MC(자재그룹)",
    "물류재고",
    "출고진행수량",
    "미완료납품수량",
    "STO가능수량",
    "합계",
  ];
  const rows = materials.map((m) => {
    const row: (string | number | null)[] = new Array(25).fill("");
    row[2] = "OIA";
    row[6] = "D1";
    row[8] = "8227";
    row[16] = m.brand;
    row[18] = m.mat;
    row[24] = 1;
    return row;
  });
  return {
    name: "1단계(STO)",
    headerRow: 1,
    headers,
    rows,
    detection: { stage: "stage1", confidence: 1, scores: {} as never, reason: "" },
  };
}

function buildStage3(bins: Array<{ mat: string; bin: string }>): ParsedSheet {
  const headers = [
    "PG No.",
    "WO",
    "WT",
    "상태",
    "자재코드",
    "내역",
    "피킹 수량",
    "확정 수량",
    "단위",
    "소스 저장유형",
    "소스 빈",
    "목적지 저장유형",
    "목적지 빈",
    "랙",
    "열",
    "단",
    "Sort Seq.",
    "자재그룹",
    "자재그룹명",
  ];
  const rows = bins.map((b) => {
    const r: (string | number | null)[] = new Array(19).fill("");
    r[0] = "PG1";
    r[4] = b.mat;
    r[6] = 1;
    r[10] = b.bin;
    r[17] = "1WCAHH";
    r[18] = "여성_캐쥬얼_반팔티";
    return r;
  });
  return {
    name: "3단계(피킹지시서패션)",
    headerRow: 1,
    headers,
    rows,
    detection: { stage: "stage3", confidence: 1, scores: {} as never, reason: "" },
  };
}

describe("generateOutput3", () => {
  it("dedupes (브랜드, 새 소스빈) and sorts ascending", () => {
    const s1 = buildStage1([
      { mat: "M1", brand: "B1" },
      { mat: "M2", brand: "B1" },
      { mat: "M3", brand: "B2" },
    ]);
    const s3 = buildStage3([
      { mat: "M1", bin: "C03-03-03-689" },
      { mat: "M2", bin: "A11-09-03-822" },
      { mat: "M3", bin: "A11-09-03-100" }, // 동일 (브랜드, newBin)? B2/A11-09-03 → 별도
      { mat: "M2", bin: "A11-09-03-999" }, // 동일 (B1, A11-09-03) → 중복
    ]);
    const out = generateOutput3(s1, s3, { outletName: "강서점", date: "2026.06.09" });
    expect(out.rows.length).toBe(3); // (B1, A11-09-03), (B1, C03-03-03), (B2, A11-09-03)
    expect(out.rows[0]?.sourceBin).toBe("A11-09-03"); // 오름차순
    expect(out.headerLine).toBe("강서점_데일리 출고일 : 2026.06.09");
  });

  it("routes E-prefixed bins to ETC (E excluded from output3)", () => {
    const s1 = buildStage1([{ mat: "M1", brand: "BRAND" }]);
    const s3 = buildStage3([
      { mat: "M1", bin: "E01-02-03-555" },
    ]);
    const out = generateOutput3(s1, s3, { outletName: "강서점", date: "2026.06.09" });
    expect(out.rows.length).toBe(0);
    expect(out.etcRows.length).toBe(1);
    expect(out.etcRows[0]?.classification).toBe("ETC_E");
  });

  it("routes G~Z bins to ETC_OTHER", () => {
    const s1 = buildStage1([{ mat: "M1", brand: "B" }]);
    const s3 = buildStage3([{ mat: "M1", bin: "G05-01-02-999" }]);
    const out = generateOutput3(s1, s3, { outletName: "강서점", date: "2026.06.09" });
    expect(out.etcRows[0]?.classification).toBe("ETC_OTHER");
  });

  it("warns and excludes bad source bin", () => {
    const s1 = buildStage1([{ mat: "M1", brand: "B" }]);
    const s3 = buildStage3([{ mat: "M1", bin: "BAD" }]);
    const out = generateOutput3(s1, s3, { outletName: "강서점", date: "2026.06.09" });
    expect(out.rows).toEqual([]);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
