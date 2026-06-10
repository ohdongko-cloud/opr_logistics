/**
 * PG번호 입력 단계 (PRD §4.7 F7)
 *
 * 자동 처리/미리보기 후 → 이 페이지에서 PG 입력 → 인쇄 미리보기.
 * blur 시 자동 저장. 동일 잡 URL 재진입 시 입력값 복원.
 */
import { notFound } from "next/navigation";

import { PgInputForm } from "@/components/pg-input-form";
import { checkJobOwnership } from "@/lib/auth/ownership";
import { getJob } from "@/lib/job/store";

export const dynamic = "force-dynamic";

export default async function PgInputPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const own = await checkJobOwnership(job);
  if (!own.ok) notFound();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <header className="border-b border-[var(--color-border)] pb-4">
        <h1 className="text-xl font-semibold">PG번호 입력</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          SAP에서 1·2단계 RAW를 등록하고 발급된 PG번호를 입력하세요. 10자리 숫자.
          plnt별로 1개만 허용됩니다.
        </p>
      </header>

      <PgInputForm
        jobId={job.id}
        plants={job.processed.detectedPlants}
        initial={job.pgNumbers}
      />
    </main>
  );
}
