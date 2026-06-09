/**
 * 잡 처리 오케스트레이터 — 4단계 ParsedSheet → 출력1·2·3 + ETC + 페이지 분할
 */
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { formatDateDot } from "@/lib/dates";
import { generateOutput1, type Output1Row } from "./output1";
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
  /** 검증 합계 (AC3, AC12) */
  totals: {
    stage1Y: number;
    output1Qty: number;
    output2PickQty: number;
  };
  detectedPlants: string[];
  outletName: string;
  generatedAt: Date;
}

export interface ProcessInput {
  stage1: ParsedSheet;
  stage3: ParsedSheet;
  stage4: ParsedSheet;
  /** plnt → outlet_name 매핑 */
  outletResolver: (plnt: string) => string | null;
  /** PG 입력 (F7에서 채워짐, 초기엔 빈) */
  pgNumbers?: Record<string, string>;
  /** 한 페이지 행 수 (기본 25, 부록 D 1차안) */
  pageRowLimit?: number;
  /** 오늘 날짜 (테스트 결정성 위해 주입) */
  today?: Date;
}

export function processJob(input: ProcessInput): ProcessedJob {
  const today = input.today ?? new Date();
  const pgNumbers = input.pgNumbers ?? {};

  const out1 = generateOutput1(input.stage1, input.outletResolver, pgNumbers);

  // 출고지명은 첫 행에서 (전 잡이 동일 출고지 가정)
  const outletName = out1.rows[0]?.outletName ?? "강서";

  const out3 = generateOutput3(input.stage1, input.stage3, {
    outletName: `${outletName}점`,
    date: formatDateDot(today),
  });

  const out2 = generateOutput2(input.stage1, input.stage3, input.stage4);

  // ETC 통합: 출력3에서 분리된 ETC + 출력2에서 분리된 ETC + 중복 제거
  const allEtc: EtcRow[] = [];
  const seenEtc = new Set<string>();
  for (const e of [...out3.etcRows, ...out2.etcRows]) {
    const key = `${e.material} ${e.newBin} ${e.boxNo}`;
    if (seenEtc.has(key)) continue;
    seenEtc.add(key);
    allEtc.push(e);
  }

  const pages = splitPages(out2.rows, { pageRowLimit: input.pageRowLimit });

  const detectedPlants = Array.from(new Set(out1.rows.map((r) => r.plnt)));

  return {
    output1: out1.rows,
    output2: out2.rows,
    output3: out3.rows,
    etc: allEtc,
    pages,
    warnings: [...out1.warnings, ...out3.warnings, ...out2.warnings],
    totals: {
      stage1Y: out1.totalQty,
      output1Qty: out1.rows.reduce((s, r) => s + r.qty, 0),
      output2PickQty: out2.totalPickQty,
    },
    detectedPlants,
    outletName,
    generatedAt: today,
  };
}
