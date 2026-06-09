/**
 * A4 인쇄 페이지 분할 (PRD §4.5 F5)
 *
 * 페이지 = (복종) × (아이템) × (그룹 ABC|DF)
 *   - 그룹 ABC = {A,B,C}, DF = {D,F}
 *   - 빈 그룹은 페이지 미생성
 *   - 그룹 내 행 수 > pageRowLimit (기본 25) 이면 다중 페이지 분할
 *     ('현재/전체' 표기로 연속성 유지)
 *
 * 페이지 내 정렬:
 *   소스빈 오름차순 (출력3 정렬과 일관)
 */
import type { Output2Row } from "./output2";

export type GroupKey = "ABC" | "DF";

export interface PrintPage {
  pageIndex: number; // 0-based
  total: number; // 전체 페이지 수
  bokjong: "W" | "M";
  item: string;
  group: GroupKey;
  /** 이 페이지에 포함될 행 */
  rows: Output2Row[];
  /** 그룹이 다중 페이지일 때 페이지 내 분할 정보 (그룹 안에서의 1/3 같은 표기) */
  groupPagePart: { current: number; total: number };
  /** 페이지 합계 (머리글 '피킹 총수량') */
  pageQtySum: number;
}

interface SplitOptions {
  /** 한 페이지에 들어갈 최대 행 수 (PRD 부록 D, 1차안 25) */
  pageRowLimit?: number;
}

const ABC_SET = new Set(["A", "B", "C"]);
const DF_SET = new Set(["D", "F"]);

function classify(row: Output2Row): GroupKey | null {
  const c = row.sourceBin[0]?.toUpperCase() ?? "";
  if (ABC_SET.has(c)) return "ABC";
  if (DF_SET.has(c)) return "DF";
  return null; // ETC — 페이지 미포함
}

function sortBySourceBinAsc(rows: Output2Row[]): Output2Row[] {
  return [...rows].sort((a, b) => {
    const cmp = a.sourceBin.localeCompare(b.sourceBin);
    if (cmp !== 0) return cmp;
    return a.boxNo.localeCompare(b.boxNo);
  });
}

export function splitPages(
  rows: ReadonlyArray<Output2Row>,
  opts: SplitOptions = {}
): PrintPage[] {
  const pageRowLimit = opts.pageRowLimit ?? 25;

  // 그룹핑: (bokjong, item, group) → rows
  type BucketKey = string;
  const buckets = new Map<BucketKey, Output2Row[]>();
  const bucketMeta = new Map<
    BucketKey,
    { bokjong: "W" | "M"; item: string; group: GroupKey }
  >();
  const bucketOrder: BucketKey[] = [];

  for (const r of rows) {
    if (r.bokjong !== "W" && r.bokjong !== "M") continue;
    const g = classify(r);
    if (g === null) continue;
    const key = `${r.bokjong}|${r.item}|${g}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      bucketMeta.set(key, { bokjong: r.bokjong, item: r.item, group: g });
      bucketOrder.push(key);
    }
    buckets.get(key)!.push(r);
  }

  // 안정 순서: bokjong (M 먼저 알파벳 순 → 일관성 위해 정렬), item ↑, group ABC→DF
  bucketOrder.sort((a, b) => {
    const ma = bucketMeta.get(a)!;
    const mb = bucketMeta.get(b)!;
    if (ma.bokjong !== mb.bokjong) return ma.bokjong.localeCompare(mb.bokjong);
    if (ma.item !== mb.item) return ma.item.localeCompare(mb.item);
    if (ma.group !== mb.group) return ma.group === "ABC" ? -1 : 1;
    return 0;
  });

  // 페이지 분할
  const pages: PrintPage[] = [];
  for (const key of bucketOrder) {
    const meta = bucketMeta.get(key)!;
    const groupRows = sortBySourceBinAsc(buckets.get(key)!);
    const chunks: Output2Row[][] = [];
    for (let i = 0; i < groupRows.length; i += pageRowLimit) {
      chunks.push(groupRows.slice(i, i + pageRowLimit));
    }
    chunks.forEach((chunk, idx) => {
      pages.push({
        pageIndex: 0, // placeholder, set later
        total: 0,
        bokjong: meta.bokjong,
        item: meta.item,
        group: meta.group,
        rows: chunk,
        groupPagePart: { current: idx + 1, total: chunks.length },
        pageQtySum: chunk.reduce((s, r) => s + r.pickQty, 0),
      });
    });
  }

  // 전체 페이지 수 채우기
  const total = pages.length;
  return pages.map((p, i) => ({ ...p, pageIndex: i, total }));
}
