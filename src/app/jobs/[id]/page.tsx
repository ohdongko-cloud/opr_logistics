/**
 * 잡 단계 라우터 페이지 (PRD #0002) — 현재 step에 맞는 화면을 JobFlow가 렌더.
 */
import { notFound } from "next/navigation";

import { JobFlow, type JobView } from "@/components/job-flow";
import { checkJobOwnership } from "@/lib/auth/ownership";
import { getJob } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const own = await checkJobOwnership(job);
  if (!own.ok) notFound();

  const view = toJobView(job) as unknown as JobView;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-4">
        <div>
          <h1 className="text-xl font-semibold">잡 #{job.id.slice(0, 8)}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            플랜트 {view.plnt} · 출고지 {view.outletName} · 만료{" "}
            {view.expiresAt.slice(0, 10)}
          </p>
        </div>
      </header>
      <JobFlow initialView={view} />
    </main>
  );
}
