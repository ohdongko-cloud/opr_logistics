/**
 * 인쇄용 단일 페이지 (PRD §4.5 F5 · §4.6 F6 · 부록 D)
 *
 * - A4 세로 (CSS @page는 globals.css)
 * - 머리글 3행 그리드 (총 약 22mm)
 * - 표 헤더 반복 (thead)
 * - 컬럼 폭 비율 부록 D
 * - 출력 컬럼: 브랜드 ~ 비고 (복종/비고 출력 시 숨김)
 */
import type { PrintPage } from "@/lib/generate/pages";

/** 부록 D — 컬럼 폭 비율 (10컬럼, 합 100%) */
const COL_WIDTHS: Array<{ key: string; label: string; pct: number }> = [
  { key: "brand", label: "브랜드", pct: 14 },
  { key: "sourceBin", label: "소스빈", pct: 10 },
  { key: "boxNo", label: "박스번호", pct: 7 },
  { key: "material", label: "자재코드", pct: 14 },
  { key: "ean", label: "EAN", pct: 13 },
  { key: "matGroup", label: "자재그룹", pct: 9 },
  { key: "matGroupName", label: "자재그룹명", pct: 18 },
  { key: "pickQty", label: "피킹수량", pct: 7 },
  { key: "unpickedQty", label: "미피킹수량", pct: 4 },
  { key: "remark", label: "비고", pct: 4 },
];

interface PickingPageProps {
  page: PrintPage;
  header: {
    /** YYYY-MM-DD/HH:MM AM/PM */
    timestamp: string;
    /** 편집 가능 문서명 */
    docTitle: string;
    /** YYYY.MM.DD */
    deliveryDate: string;
    pgNumber: string;
  };
  footer: {
    /** MMDD_강서점 데일리 필업_O구매그룹 */
    leftText: string;
    /** "현재/전체" */
    pageOfTotal: string;
  };
}

export function PickingPage({ page, header, footer }: PickingPageProps) {
  return (
    <article className="print-page">
      <header className="print-header text-[8pt] leading-snug">
        <div className="row-1 text-center font-medium">{header.timestamp}</div>
        <div className="row-2 mt-1 flex items-baseline justify-between">
          <div className="font-semibold">{header.docTitle}</div>
          <div>작업자 :</div>
        </div>
        <div className="row-3 mt-1 flex items-baseline justify-between gap-4">
          <div>출고요청일 : {header.deliveryDate}</div>
          <div className="font-medium">PG번호 : {header.pgNumber || "—"}</div>
          <div>피킹 총수량 : {page.pageQtySum}</div>
        </div>
        <div className="mt-1 text-[7pt] text-[var(--color-muted)]">
          복종 {page.bokjong} · 아이템 {page.item} · 그룹 {page.group}
          {page.groupPagePart.total > 1
            ? ` · 그룹 페이지 ${page.groupPagePart.current}/${page.groupPagePart.total}`
            : ""}
        </div>
      </header>

      <table className="picking mt-2 w-full text-[8pt]">
        <colgroup>
          {COL_WIDTHS.map((c) => (
            <col key={c.key} style={{ width: `${c.pct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-slate-100 text-left">
            {COL_WIDTHS.map((c) => (
              <th
                key={c.key}
                className="px-1 py-1 text-[8pt] font-semibold"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r, i) => (
            <tr key={`${r.material}-${r.sourceBin}-${r.boxNo}-${i}`} className="row">
              <td>{r.brand}</td>
              <td>{r.sourceBin}</td>
              <td>{r.boxNo}</td>
              <td>{r.material}</td>
              <td>{r.ean}</td>
              <td>{r.matGroup}</td>
              <td>{r.matGroupName}</td>
              <td>{r.pickQty}</td>
              <td>{r.unpickedQty || ""}</td>
              <td>{r.remark || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="print-footer mt-2 flex items-baseline justify-between text-[7pt] text-[var(--color-muted)]">
        <div>{footer.leftText}</div>
        <div>{footer.pageOfTotal}</div>
      </footer>
    </article>
  );
}
