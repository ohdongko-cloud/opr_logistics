/**
 * 잡 생애주기 통합 테스트 (인메모리 백엔드 — DATABASE_URL 미설정 시)
 * STEP1 → PG → 3단계 → 4단계 → ready 전이 + 무효화 + 불법전이 거부.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import {
  attachStage,
  clearJobStore,
  createJobAtStep1,
  finalizeJob,
  getJob,
  setPgNumbers,
} from "./store";

function sheet(
  name: string,
  headers: string[],
  rows: (string | number | null)[][],
  stage: "stage1" | "stage3" | "stage4"
): ParsedSheet {
  return {
    name,
    headerRow: 1,
    headers,
    rows,
    detection: { stage, confidence: 1, scores: {} as never, reason: "" },
  };
}

const S1_HEADERS = [
  "구매 그룹", "구매그룹 내역", "구매 문서", "Plnt", "분배 지정일",
  "오리지날 브랜드", "자재", "오리지날 브랜드명", "MC(자재그룹)",
  "물류재고", "출고진행수량", "미완료납품수량", "STO가능수량", "합계", "분배번호", "납품",
];
// 인덱스: 구매그룹0 plnt3 자재6 브랜드명7 합계13 분배번호14 납품15
function s1row(m: {
  pg: string; plnt: string; mat: string; brand: string; qty: number;
  dist: string; deliv: string;
}): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(16).fill("");
  r[0] = m.pg; r[3] = m.plnt; r[6] = m.mat; r[7] = m.brand;
  r[13] = m.qty; r[14] = m.dist; r[15] = m.deliv;
  return r;
}
const STAGE1 = sheet("1단계(STO)", S1_HEADERS, [
  s1row({ pg: "OIA", plnt: "8227", mat: "M1", brand: "로씨로씨(ROCCI)", qty: 3, dist: "D1", deliv: "DLV1" }),
  s1row({ pg: "OIA", plnt: "8227", mat: "M2", brand: "로씨로씨(ROCCI)", qty: 2, dist: "D1", deliv: "DLV1" }),
  s1row({ pg: "OJA", plnt: "8227", mat: "M3", brand: "아디다스(ADIDAS)", qty: 5, dist: "D2", deliv: "DLV2" }),
], "stage1");

const S3_HEADERS = [
  "PG No.", "WO", "WT", "상태", "자재코드", "내역", "피킹 수량", "확정 수량",
  "단위", "소스 저장유형", "소스 빈", "목적지 저장유형", "목적지 빈", "랙", "열", "단",
  "Sort Seq.", "자재그룹", "자재그룹명",
];
function s3row(mat: string, bin: string, qty: number, mg: string): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(19).fill("");
  r[0] = "PG1"; r[4] = mat; r[6] = qty; r[10] = bin; r[17] = mg; r[18] = "명";
  return r;
}
const STAGE3 = sheet("3단계(피킹지시서패션)", S3_HEADERS, [
  s3row("M1", "A11-09-03-822", 3, "1WCAHH"),
  s3row("M2", "B05-01-02-100", 2, "1WCAKK"),
  s3row("M3", "A05-02-01-050", 5, "1MCATC"),
], "stage3");

const S4_HEADERS = ["상품코드", "EAN코드", "상품명", "판매단위", "입수수량"];
function s4row(pc: string, ean: string): (string | number | null)[] {
  const r: (string | number | null)[] = new Array(5).fill("");
  r[0] = pc; r[1] = ean;
  return r;
}
const STAGE4 = sheet("4단계(EAN)", S4_HEADERS, [
  s4row("M1", "M1"), s4row("M2", "M2"), s4row("M3", "M3"),
], "stage4");

describe("잡 생애주기 (인메모리)", () => {
  beforeEach(() => clearJobStore());

  it("STEP1 생성 → 출력1 본문 + step=s1_uploaded", async () => {
    const job = await createJobAtStep1({
      stage1: STAGE1, sourceFilename: "1.xlsx", plnt: "8227", createdByEmail: "a@b.com",
    });
    expect(job.step).toBe("s1_uploaded");
    expect(job.data.output1).not.toBeNull();
    // 합계 = 3+2+5 = 10
    expect(job.data.output1!.totals.stage1Y).toBe(10);
    // (납품,구매그룹,plnt,브랜드) 그룹: DLV1/OIA/로씨로씨(5), DLV2/OJA/아디다스(5) = 2행
    expect(job.data.output1!.output1.length).toBe(2);
    expect(job.createdByEmail).toBe("a@b.com");
  });

  it("전체 흐름 STEP1→PG→3→4→ready", async () => {
    const job = await createJobAtStep1({
      stage1: STAGE1, sourceFilename: "1.xlsx", plnt: "8227", createdByEmail: "a@b.com",
    });
    // PG 입력 (s1→pg 직행)
    const pg = await setPgNumbers(job.id, { "8227": "1000191008" });
    expect(pg.ok).toBe(true);
    expect(pg.job!.step).toBe("pg_entered");
    expect(pg.job!.data.output1!.output1[0]!.pgNumber).toBe("1000191008");

    // 3단계
    const s3 = await attachStage(job.id, 3, STAGE3, "3.xlsx");
    expect(s3.ok).toBe(true);
    expect(s3.job!.step).toBe("s3_uploaded");

    // 4단계 → s4_uploaded
    const s4 = await attachStage(job.id, 4, STAGE4, "4.xlsx");
    expect(s4.ok).toBe(true);
    expect(s4.job!.step).toBe("s4_uploaded");

    // finalize → ready
    const fin = await finalizeJob(job.id);
    expect(fin.ok).toBe(true);
    expect(fin.job!.step).toBe("ready");
    expect(fin.job!.data.outputs23).not.toBeNull();
    // 출력2 피킹수량 합 = 10
    expect(fin.job!.data.outputs23!.output2PickQty).toBe(10);
    expect(fin.job!.data.outputs23!.pages.length).toBeGreaterThan(0);
  });

  it("불법 전이 거부: s1에서 바로 3단계 첨부 불가", async () => {
    const job = await createJobAtStep1({
      stage1: STAGE1, sourceFilename: "1.xlsx", plnt: "8227", createdByEmail: null,
    });
    const s3 = await attachStage(job.id, 3, STAGE3, "3.xlsx");
    expect(s3.ok).toBe(false);
    expect(s3.error).toBe("illegal_transition");
  });

  it("STEP2 경유 흐름: s1→s2→pg", async () => {
    const job = await createJobAtStep1({
      stage1: STAGE1, sourceFilename: "1.xlsx", plnt: "8227", createdByEmail: null,
    });
    const s2 = await attachStage(job.id, 2, sheet("2단계(물류분배)", ["분배번호"], [["D1"]], "stage1" as never), "2.xlsx");
    expect(s2.ok).toBe(true);
    expect(s2.job!.step).toBe("s2_uploaded");
    const pg = await setPgNumbers(job.id, { "8227": "1000191008" });
    expect(pg.ok).toBe(true);
    expect(pg.job!.step).toBe("pg_entered");
  });

  it("getJob: 없는 잡 null", async () => {
    expect(await getJob("nope")).toBeNull();
  });
});
