/**
 * 인쇄 미리보기 페이지 (PRD #0002 §4.8) — step=ready 잡의 출력2 A4 페이지 렌더.
 */
import { notFound, redirect } from "next/navigation";

import { JobControls } from "@/components/job-controls";
import { PickingPage } from "@/components/print/picking-page";
import { checkJobOwnership } from "@/lib/auth/ownership";
import { formatDateDot, formatMmDd, formatPrintTimestamp } from "@/lib/dates";
import { getJob } from "@/lib/job/store";

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const own = await checkJobOwnership(job);
  if (!own.ok) notFound();
  if (job.step !== "ready" || !job.data.outputs23) {
    redirect(`/jobs/${id}`);
  }

  const o23 = job.data.outputs23;
  const outletName = job.data.output1?.outletName ?? "강서";
  const today = new Date();
  const timestamp = formatPrintTimestamp(today);
  const docTitle =
    job.headerOverrides.docTitle ??
    `피킹지시서 - ${outletName}점 데일리 필업(O구매그룹)`;
  const deliveryDate = job.headerOverrides.deliveryDate ?? formatDateDot(today);
  const footerLeft =
    job.headerOverrides.footerLeft ??
    `${formatMmDd(today)}_${outletName}점 데일리 필업_O구매그룹`;
  const pgNumberDisplay = Object.values(job.pgNumbers).join(", ");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8 print:p-0">
      <header className="no-print flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold">잡 #{job.id.slice(0, 8)} 인쇄</h1>
          <p className="text-xs text-[var(--color-muted)]">
            페이지 {o23.pages.length} · ETC {o23.etc.length}
          </p>
        </div>
        <a href={`/jobs/${id}`} className="no-print text-xs underline text-[var(--color-muted)]">
          ← 단계로 돌아가기
        </a>
      </header>

      <JobControls
        jobId={job.id}
        initialOverrides={{ docTitle, deliveryDate, footerLeft }}
        initialEtcAck={job.etcAcknowledged}
        etcCount={o23.etc.length}
        pgComplete={true}
        detectedPlants={job.data.output1?.detectedPlants ?? []}
      />

      {o23.warnings.length > 0 && (
        <details className="no-print rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-xs">
          <summary className="cursor-pointer font-medium">
            경고 {o23.warnings.length}건
          </summary>
          <ul className="mt-2 list-disc pl-4 text-[var(--color-muted)]">
            {o23.warnings.slice(0, 20).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {o23.pages.map((p) => (
        <PickingPage
          key={p.pageIndex}
          page={p}
          header={{ timestamp, docTitle, deliveryDate, pgNumber: pgNumberDisplay }}
          footer={{
            leftText: footerLeft,
            pageOfTotal: `${p.pageIndex + 1} / ${p.total}`,
          }}
        />
      ))}

      {o23.pages.length === 0 && (
        <p className="no-print rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          인쇄할 페이지가 없습니다 (ETC만 있거나 분리 가능한 행 0건).
        </p>
      )}
    </main>
  );
}
