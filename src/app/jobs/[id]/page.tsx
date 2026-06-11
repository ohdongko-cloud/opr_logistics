/**
 * 잡 단계 라우터 페이지 (PRD #0002) — 현재 step에 맞는 화면을 JobFlow가 렌더.
 */
import { notFound } from "next/navigation";

import { JobFlow, type JobView } from "@/components/job-flow";
import { checkJobOwnership } from "@/lib/auth/ownership";
import { enforcePasswordSet } from "@/lib/auth/page-guard";
import { getCurrentEmail } from "@/lib/auth/session";
import { getJob } from "@/lib/job/store";
import { toJobView } from "@/lib/job/view";

export const dynamic = "force-dynamic";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 비번 미설정 → /set-password (PRD #0004 F6)
  await enforcePasswordSet(await getCurrentEmail());
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const own = await checkJobOwnership(job);
  if (!own.ok) notFound();

  const view = toJobView(job) as unknown as JobView;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      {/* 잡 요약 헤더는 JobFlow가 자체 렌더 (PRD #0002 F14.4) */}
      <JobFlow initialView={view} />
    </main>
  );
}
