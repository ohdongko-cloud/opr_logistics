"use client";

import { useState } from "react";

import { JobFlow, type JobView } from "@/components/job-flow";
import { StepOneUpload } from "@/components/step-one-upload";

/**
 * 홈 인라인 호스팅 (PRD #0002 F12).
 * 업로드 전: 한 줄 안내 + 업로드. 업로드 후: 라우트 이동 없이 같은 화면에서 JobFlow 인라인.
 */
export function HomeFlow() {
  const [view, setView] = useState<JobView | null>(null);

  if (view) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3">
          <p className="text-xs text-[var(--color-muted)]">
            잡 <span className="font-medium text-slate-700">#{view.id.slice(0, 8)}</span>{" "}
            · 플랜트 {view.plnt} · 출고지 {view.outletName} · 만료{" "}
            {view.expiresAt.slice(0, 10)}
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "현재 작업 화면을 닫고 새 1단계 업로드로 돌아갈까요? (진행 중 잡은 서버에 보존됩니다)"
                )
              ) {
                setView(null);
              }
            }}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
          >
            + 새 작업
          </button>
        </div>
        <JobFlow initialView={view} />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border border-dashed border-[var(--color-border)] bg-slate-50 px-4 py-3 text-xs text-[var(--color-muted)]">
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
          안내
        </span>{" "}
        1단계(STO) 파일을 업로드하면 <strong className="text-slate-700">이 화면에서 바로</strong>{" "}
        단계 표시줄과 ‹ 이전 / 다음 › 화살표로 자유롭게 이동할 수 있습니다.
      </div>
      <StepOneUpload onCreated={setView} />
    </>
  );
}
