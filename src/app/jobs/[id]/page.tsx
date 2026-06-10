/**
 * 잡 미리보기 페이지 (PRD §5 / §4.5 / §4.6 / §4.8)
 *
 * - 머리글/바닥글 인라인 편집 (자동 저장)
 * - ETC 확인 체크박스 (0건 아니면 인쇄 비활성)
 * - 통합 엑셀 다운로드
 * - PG 입력 필요 시 별도 페이지 링크
 * - A4 인쇄 페이지 N개 렌더
 *
 * 인메모리 store M5. M6에서 Neon으로 교체.
 */
import { notFound } from "next/navigation";

import { JobControls } from "@/components/job-controls";
import { PickingPage } from "@/components/print/picking-page";
import { checkJobOwnership } from "@/lib/auth/ownership";
import { formatDateDot, formatMmDd, formatPrintTimestamp } from "@/lib/dates";
import { getJob } from "@/lib/job/store";

export const dynamic = "force-dynamic";

export default async function JobPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const own = await checkJobOwnership(job);
  if (!own.ok) notFound();

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
  const pgComplete =
    processed.detectedPlants.length > 0 &&
    processed.detectedPlants.every(
      (p) => (job.pgNumbers[p] ?? "").length === 10
    );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8 print:p-0">
      <header className="no-print flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold">잡 #{job.id.slice(0, 8)}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            플랜트 {job.plnt} · 출고지 {job.outletName} · 페이지{" "}
            {processed.pages.length} · 자재 {processed.output2.length} · ETC{" "}
            {processed.etc.length} · 만료 {job.expiresAt.toISOString().slice(0, 10)}
          </p>
        </div>
      </header>

      <JobControls
        jobId={job.id}
        initialOverrides={{
          docTitle: job.headerOverrides.docTitle ?? docTitle,
          deliveryDate: job.headerOverrides.deliveryDate ?? deliveryDate,
          footerLeft: job.headerOverrides.footerLeft ?? footerLeft,
        }}
        initialEtcAck={job.etcAcknowledged}
        etcCount={processed.etc.length}
        pgComplete={pgComplete}
        detectedPlants={processed.detectedPlants}
      />

      {/* 합계 정합성 검증 */}
      {(processed.totals.output1Qty !== processed.totals.stage1Y ||
        processed.totals.output2PickQty !== processed.totals.stage1Y) && (
        <div className="no-print rounded-md bg-rose-50 px-4 py-2 text-xs text-rose-900">
          ⚠ 합계 검증 실패: 1단계 Y합({processed.totals.stage1Y}) · 출력1(
          {processed.totals.output1Qty}) · 출력2({processed.totals.output2PickQty})
        </div>
      )}

      {processed.warnings.length > 0 && (
        <details className="no-print rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs">
          <summary className="cursor-pointer font-medium">
            경고 {processed.warnings.length}건
          </summary>
          <ul className="mt-2 list-disc pl-4 text-[var(--color-muted)]">
            {processed.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {processed.warnings.length > 20 && (
              <li>… 외 {processed.warnings.length - 20}건 생략</li>
            )}
          </ul>
        </details>
      )}

      {/* 인쇄 페이지 */}
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
