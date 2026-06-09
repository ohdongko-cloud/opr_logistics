import { describe, expect, it } from "vitest";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { generateOutput2, pickEan } from "./output2";

function makeSheet(
  name: string,
  headers: string[],
  rows: (string | number | null)[][],
  stage: "stage1" | "stage2" | "stage3" | "stage4"
): ParsedSheet {
  return {
    name,
    headerRow: 1,
    headers,
    rows,
    detection: { stage, confidence: 1, scores: {} as never, reason: "" },
  };
}

const STAGE1_HEADERS = [
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

const STAGE3_HEADERS = [
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

const STAGE4_HEADERS = [
  "상품코드",
  "EAN코드",
  "상품명",
  "판매단위",
  "입수수량",
  "구매 그룹",
  "구매그룹 내역",
  "자재 그룹",
  "자재 그룹 내역",
];

function s1row(meta: { mat: string; brand: string; qty: number }): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(25).fill("");
  r[2] = "OIA";
  r[6] = "D1";
  r[8] = "8227";
  r[16] = meta.brand;
  r[18] = meta.mat;
  r[24] = meta.qty;
  return r;
}

function s3row(meta: {
  mat: string;
  bin: string;
  qty: number;
  matGroup: string;
  matGroupName?: string;
}): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(19).fill("");
  r[0] = "PG1";
  r[4] = meta.mat;
  r[6] = meta.qty;
  r[10] = meta.bin;
  r[17] = meta.matGroup;
  r[18] = meta.matGroupName ?? "matGroupName";
  return r;
}

function s4row(productCode: string, ean: string): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(9).fill("");
  r[0] = productCode;
  r[1] = ean;
  return r;
}

describe("pickEan", () => {
  it("prefers EAN == productCode", () => {
    const map = new Map([
      [
        "M1",
        [
          { productCode: "M1", ean: "8800000000001" },
          { productCode: "M1", ean: "M1" },
        ],
      ],
    ]);
    expect(pickEan("M1", map).ean).toBe("M1");
  });
  it("falls back to first row when none match", () => {
    const map = new Map([
      [
        "M2",
        [
          { productCode: "M2", ean: "AAA" },
          { productCode: "M2", ean: "BBB" },
        ],
      ],
    ]);
    expect(pickEan("M2", map).ean).toBe("AAA");
  });
  it("returns empty when no match", () => {
    const r = pickEan("X", new Map());
    expect(r.ean).toBe("");
    expect(r.matched).toBe(false);
  });
});

describe("generateOutput2", () => {
  it("dedupes by (material, newBin, boxNo) and extracts 복종/아이템", () => {
    const s1 = makeSheet("1", STAGE1_HEADERS, [
      s1row({ mat: "M1", brand: "BRAND(EN)", qty: 5 }),
    ], "stage1");
    const s3 = makeSheet("3", STAGE3_HEADERS, [
      s3row({ mat: "M1", bin: "A11-09-03-822", qty: 2, matGroup: "1WCAHH" }),
      // same (mat, newBin) but different box → 별도 행
      s3row({ mat: "M1", bin: "A11-09-03-823", qty: 3, matGroup: "1WCAHH" }),
      // same (mat, newBin, box) → 중복 제거
      s3row({ mat: "M1", bin: "A11-09-03-822", qty: 99, matGroup: "1WCAHH" }),
    ], "stage3");
    const s4 = makeSheet("4", STAGE4_HEADERS, [
      s4row("M1", "M1"),
    ], "stage4");
    const out = generateOutput2(s1, s3, s4);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.brand).toBe("BRAND");
    expect(out.rows[0]?.bokjong).toBe("W");
    expect(out.rows[0]?.item).toBe("HH");
    expect(out.rows[0]?.ean).toBe("M1");
    expect(out.totalPickQty).toBe(5);
  });

  it("routes E-bin to ETC", () => {
    const s1 = makeSheet("1", STAGE1_HEADERS, [
      s1row({ mat: "M1", brand: "B", qty: 1 }),
    ], "stage1");
    const s3 = makeSheet("3", STAGE3_HEADERS, [
      s3row({ mat: "M1", bin: "E01-02-03-555", qty: 1, matGroup: "1WCAHH" }),
    ], "stage3");
    const s4 = makeSheet("4", STAGE4_HEADERS, [s4row("M1", "M1")], "stage4");
    const out = generateOutput2(s1, s3, s4);
    expect(out.rows).toHaveLength(0);
    expect(out.etcRows).toHaveLength(1);
    expect(out.etcRows[0]?.classification).toBe("ETC_E");
  });

  it("routes invalid 복종 to ETC", () => {
    const s1 = makeSheet("1", STAGE1_HEADERS, [
      s1row({ mat: "M1", brand: "B", qty: 1 }),
    ], "stage1");
    const s3 = makeSheet("3", STAGE3_HEADERS, [
      // matGroup '1XCATC' → [1]='X' → 화이트리스트 실패
      s3row({ mat: "M1", bin: "A11-09-03-822", qty: 1, matGroup: "1XCATC" }),
    ], "stage3");
    const s4 = makeSheet("4", STAGE4_HEADERS, [s4row("M1", "M1")], "stage4");
    const out = generateOutput2(s1, s3, s4);
    expect(out.rows).toHaveLength(0);
    expect(out.etcRows).toHaveLength(1);
  });
});
