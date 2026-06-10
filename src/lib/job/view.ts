/**
 * 잡 → 클라이언트 뷰 변환 (PRD #0002) — 단계별 복사 데이터 + 진행 상태.
 */
import { extractColumn } from "@/lib/extract/columns";
import { resolveStage1, resolveStage3 } from "@/lib/sheets/columns";
import type { JobRecord } from "./store";
import { stepToScreen, type JobStep } from "./transitions";

export interface CopyColumn {
  key: string;
  label: string;
  values: string[];
  count: number;
}

export interface JobView {
  id: string;
  step: JobStep;
  screen: number;
  plnt: string;
  outletName: string;
  detectedPlants: string[];
  pgNumbers: Record<string, string>;
  headerOverrides: JobRecord["headerOverrides"];
  etcAcknowledged: boolean;
  expiresAt: string;
  /** 단계별 복사 컬럼 (분배번호/자재/자재코드) */
  copy: CopyColumn[];
  /** 합계 검증 (출력1) */
  totals: { stage1Y: number; output1Qty: number } | null;
  output1RowCount: number;
  warningsCount: number;
  pageCount: number;
  etcCount: number;
}

export function toJobView(job: JobRecord): JobView {
  const copy: CopyColumn[] = [];
  const s1 = job.data.stages.stage1;
  if (s1) {
    const c1 = resolveStage1(s1.headers);
    if (c1.distributionNo >= 0) {
      const e = extractColumn(s1, c1.distributionNo, true);
      copy.push({ key: "distributionNo", label: "분배번호", values: e.values, count: e.values.length });
    }
    if (c1.material >= 0) {
      const e = extractColumn(s1, c1.material, true);
      copy.push({ key: "material", label: "자재", values: e.values, count: e.values.length });
    }
  }
  const s3 = job.data.stages.stage3;
  if (s3) {
    const c3 = resolveStage3(s3.headers);
    if (c3.material >= 0) {
      const e = extractColumn(s3, c3.material, true);
      copy.push({ key: "materialCode", label: "자재코드", values: e.values, count: e.values.length });
    }
  }

  const out1 = job.data.output1;
  const o23 = job.data.outputs23;
  return {
    id: job.id,
    step: job.step,
    screen: stepToScreen(job.step),
    plnt: job.plnt,
    outletName: out1?.outletName ?? "강서",
    detectedPlants: out1?.detectedPlants ?? [job.plnt],
    pgNumbers: job.pgNumbers,
    headerOverrides: job.headerOverrides,
    etcAcknowledged: job.etcAcknowledged,
    expiresAt: job.expiresAt.toISOString(),
    copy,
    totals: out1?.totals ?? null,
    output1RowCount: out1?.output1.length ?? 0,
    warningsCount: (out1?.warnings.length ?? 0) + (o23?.warnings.length ?? 0),
    pageCount: o23?.pages.length ?? 0,
    etcCount: o23?.etc.length ?? 0,
  };
}
