import { describe, expect, it } from "vitest";
import { generateOutput1 } from "./output1";
import type { ParsedSheet } from "@/lib/parser/xlsx";

/** 1단계 형태 시뮬레이션 (헤더 + 행). 25개 컬럼 (index 0~24). */
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

/** 핵심 컬럼만 받아서 25칸 row 생성 */
function row(meta: {
  pg: string;
  delivery: string;
  plnt: string;
  brandName: string;
  material: string;
  qty: number;
}): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(25).fill("");
  r[2] = meta.pg;
  r[6] = meta.delivery;
  r[8] = meta.plnt;
  r[16] = meta.brandName;
  r[18] = meta.material;
  r[24] = meta.qty;
  return r;
}

function buildStage1(rows: (string | number | null)[][]): ParsedSheet {
  return {
    name: "1단계(STO)",
    headerRow: 1,
    headers: STAGE1_HEADERS,
    rows,
    detection: {
      stage: "stage1",
      confidence: 1,
      scores: {} as never,
      reason: "",
    },
  };
}

const RESOLVER = (plnt: string) => (plnt === "8227" ? "강서" : null);

describe("generateOutput1", () => {
  it("groups by (납품, 구매그룹, plnt, 브랜드) and SUMs Y column", () => {
    const rows = [
      row({
        pg: "OIA",
        delivery: "8043688157",
        plnt: "8227",
        brandName: "ROCCI(ROCCI)",
        material: "10463820001",
        qty: 2,
      }),
      row({
        pg: "OIA",
        delivery: "8043688157",
        plnt: "8227",
        brandName: "ROCCI(ROCCI)",
        material: "10463820002",
        qty: 3,
      }),
      row({
        pg: "OIA",
        delivery: "8043688157",
        plnt: "8227",
        brandName: "OTHER(X)",
        material: "10463820003",
        qty: 7,
      }),
    ];
    const out = generateOutput1(buildStage1(rows), RESOLVER);
    expect(out.rows).toHaveLength(2);
    const roccirow = out.rows.find((r) => r.brand === "ROCCI");
    expect(roccirow?.qty).toBe(5);
    expect(roccirow?.outletName).toBe("강서");
    expect(roccirow?.deliveryNo).toBe("8043688157");
    expect(out.totalQty).toBe(12);
  });

  it("warns for unknown plant", () => {
    const rows = [
      row({
        pg: "OIA",
        delivery: "9000000001",
        plnt: "9999",
        brandName: "TEST",
        material: "M001",
        qty: 1,
      }),
    ];
    const out = generateOutput1(buildStage1(rows), RESOLVER);
    expect(out.rows[0]?.outletName).toBe("미정");
    expect(out.warnings.some((w) => w.includes("9999"))).toBe(true);
  });

  it("returns empty + warning when headers are missing required columns", () => {
    const sheet: ParsedSheet = {
      name: "broken",
      headerRow: 1,
      headers: ["aaa", "bbb"],
      rows: [["x", 1]],
      detection: {
        stage: "stage1",
        confidence: 0,
        scores: {} as never,
        reason: "",
      },
    };
    const out = generateOutput1(sheet, RESOLVER);
    expect(out.rows).toEqual([]);
    expect(out.warnings[0]).toMatch(/필수 컬럼 누락/);
  });

  it("applies PG input when provided", () => {
    const rows = [
      row({
        pg: "OIA",
        delivery: "8043688157",
        plnt: "8227",
        brandName: "BRAND",
        material: "M1",
        qty: 1,
      }),
    ];
    const out = generateOutput1(buildStage1(rows), RESOLVER, {
      "8227": "1000191008",
    });
    expect(out.rows[0]?.pgNumber).toBe("1000191008");
  });
});
