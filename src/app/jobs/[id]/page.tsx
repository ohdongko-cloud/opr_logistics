/**
 * 잡 미리보기 페이지 — 인쇄 미리보기 + 출력1/2/3/ETC 탭 (PRD §5 / §4.5)
 *
 * M4 단계: 인메모리 잡 store에서 조회. 새로고침에도 살아 있음(서버 프로세스 동안).
 * M5에서 Neon + Blob 영속화로 교체. (잡 만료 시 404)
 */
import { notFound } from "next/navigation";

import { PickingPage } from "@/components/print/picking-page";
import { PrintButton } from "@/components/print-button";
import { formatDateDot, formatMmDd, formatPrintTimestamp } from "@/lib/dates";
import { getJob } from "@/lib/job/store";

export const dynamic = "force-dynamic";

export default async function JobPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) notFound();

  const today = new Date();
  const timestamp = formatPrintTimestamp(today);
  const docTitle =
    job.headerOverrides.docTitle ??
    `피킹지시서 - ${job.outletName}점 데일리 필업(O구매그룹)`;
  const deliveryDate =
    job.headerOverrides.deliveryDate ?? formatDateDot(today);
  const footerLeft =
    job.headerOverrides.footerLeft ??
    `${formatMmDd(today)}_${job.outletName}점 데일리 필업_O구매그룹`;

  const pgNumberDisplay = Object.values(job.pgNumbers).join(", ");
  const { processed } = job;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8 print:p-0">
      <header className="no-print flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold">잡 #{job.id.slice(0, 8)}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            플랜트 {job.plnt} · 출고지 {job.outletName} · 페이지{" "}
            {processed.pages.length} · 자재 {processed.output2.length}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton label="인쇄 (Ctrl+P)" />
        </div>
      </header>

      {processed.totals.output2PickQty !== processed.totals.stage1Y && (
        <div className="no-print rounded-md bg-amber-50 px-4 py-2 text-xs text-amber-900">
          ⚠ 합계 검증 실패: 1단계 Y합({processed.totals.stage1Y}) ≠ 출력2 합(
          {processed.totals.output2PickQty})
        </div>
      )}

      {processed.etc.length > 0 && (
        <div className="no-print rounded-md bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>ETC 리포트 {processed.etc.length}건</strong> — 인쇄 페이지에 포함되지
          않습니다 (E·G~Z로 시작하는 소스빈). 현장 출고 누락 방지를 위해 별도 확인
          필요. (확인 체크박스 UI는 다음 커밋에서 추가)
        </div>
      )}

      {processed.warnings.length > 0 && (
        <details className="no-print rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs">
          <summary className="cursor-pointer font-medium">
            경고 {processed.warnings.length}건
          </summary>
          <ul className="mt-2 list-disc pl-4 text-[var(--color-muted)]">
            {processed.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {processed.pages.map((p) => (
        <PickingPage
          key={p.pageIndex}
          page={p}
          header={{
            timestamp,
            docTitle,
            deliveryDate,
            pgNumber: pgNumberDisplay,
          }}
          footer={{
            leftText: footerLeft,
            pageOfTotal: `${p.pageIndex + 1} / ${p.total}`,
          }}
        />
      ))}

      {processed.pages.length === 0 && (
        <p className="no-print rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          인쇄할 페이지가 없습니다. ETC 리포트만 있거나 분리 가능한 행이 0건입니다.
        </p>
      )}
    </main>
  );
}
