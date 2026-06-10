/**
 * 잡 처리 오케스트레이터 (PRD #0002 §4.8 — 단계별 부분 처리로 분해)
 *
 *  - processOutput1:   STEP1 직후. stage1 단독으로 출력1 본문 + 합계 검증 + 출고지/플랜트.
 *  - processOutputs23: STEP7. stage1+3+4로 출력2·3 + ETC + 페이지 분할.
 *  - processJob:       (호환용) 1·3·4 동시 — 위 둘을 합친 결과. 기존 호출/테스트 유지.
 */
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { formatDateDot } from "@/lib/dates";
import {
  generateOutput1,
  type OutletResolver,
  type Output1Row,
} from "./output1";
import { generateOutput2, type Output2Row } from "./output2";
import { generateOutput3, type EtcRow, type Output3Row } from "./output3";
import { splitPages, type PrintPage } from "./pages";

export interface ProcessedJob {
  output1: Output1Row[];
  output2: Output2Row[];
  output3: Output3Row[];
  etc: EtcRow[];
  pages: PrintPage[];
  warnings: string[];
  totals: {
    stage1Y: number;
    output1Qty: number;
    output2PickQty: number;
  };
  detectedPlants: string[];
  outletName: string;
  generatedAt: Date;
}

// ============================================================================
// STEP1 직후 — 출력1 본문 (stage1 단독)
// ============================================================================
export interface Output1StepResult {
  output1: Output1Row[];
  warnings: string[];
  totals: { stage1Y: number; output1Qty: number };
  detectedPlants: string[];
  outletName: string;
}

export function processOutput1(input: {
  stage1: ParsedSheet;
  outletResolver: OutletResolver;
  pgNumbers?: Record<string, string>;
}): Output1StepResult {
  const out1 = generateOutput1(
    input.stage1,
    input.outletResolver,
    input.pgNumbers ?? {}
  );
  const outletName = out1.rows[0]?.outletName ?? "강서";
  const detectedPlants = Array.from(new Set(out1.rows.map((r) => r.plnt)));
  return {
    output1: out1.rows,
    warnings: out1.warnings,
    totals: {
      stage1Y: out1.totalQty,
      output1Qty: out1.rows.reduce((s, r) => s + r.qty, 0),
    },
    detectedPlants,
    outletName,
  };
}

// ============================================================================
// STEP7 — 출력2·3 + ETC + 페이지 분할 (stage1+3+4)
// ============================================================================
export interface Outputs23Result {
  output2: Output2Row[];
  output3: Output3Row[];
  etc: EtcRow[];
  pages: PrintPage[];
  warnings: string[];
  output2PickQty: number;
}

export function processOutputs23(input: {
  stage1: ParsedSheet;
  stage3: ParsedSheet;
  stage4: ParsedSheet;
  outletName: string;
  pageRowLimit?: number;
  today?: Date;
}): Outputs23Result {
  const today = input.today ?? new Date();
  const out3 = generateOutput3(input.stage1, input.stage3, {
    outletName: `${input.outletName}점`,
    date: formatDateDot(today),
  });
  const out2 = generateOutput2(input.stage1, input.stage3, input.stage4);

  const allEtc: EtcRow[] = [];
  const seenEtc = new Set<string>();
  for (const e of [...out3.etcRows, ...out2.etcRows]) {
    const key = `${e.material} ${e.newBin} ${e.boxNo}`;
    if (seenEtc.has(key)) continue;
    seenEtc.add(key);
    allEtc.push(e);
  }
  const pages = splitPages(out2.rows, { pageRowLimit: input.pageRowLimit });
  return {
    output2: out2.rows,
    output3: out3.rows,
    etc: allEtc,
    pages,
    warnings: [...out3.warnings, ...out2.warnings],
    output2PickQty: out2.totalPickQty,
  };
}

// ============================================================================
// 호환용 — 1·3·4 동시 (기존 호출/테스트 유지)
// ============================================================================
export interface ProcessInput {
  stage1: ParsedSheet;
  stage3: ParsedSheet;
  stage4: ParsedSheet;
  outletResolver: OutletResolver;
  pgNumbers?: Record<string, string>;
  pageRowLimit?: number;
  today?: Date;
}

export function processJob(input: ProcessInput): ProcessedJob {
  const today = input.today ?? new Date();
  const o1 = processOutput1({
    stage1: input.stage1,
    outletResolver: input.outletResolver,
    pgNumbers: input.pgNumbers,
  });
  const o23 = processOutputs23({
    stage1: input.stage1,
    stage3: input.stage3,
    stage4: input.stage4,
    outletName: o1.outletName,
    pageRowLimit: input.pageRowLimit,
    today,
  });
  return {
    output1: o1.output1,
    output2: o23.output2,
    output3: o23.output3,
    etc: o23.etc,
    pages: o23.pages,
    warnings: [...o1.warnings, ...o23.warnings],
    totals: {
      stage1Y: o1.totals.stage1Y,
      output1Qty: o1.totals.output1Qty,
      output2PickQty: o23.output2PickQty,
    },
    detectedPlants: o1.detectedPlants,
    outletName: o1.outletName,
    generatedAt: today,
  };
}
