import { AppHeader } from "@/components/app-header";
import { StepOneUpload } from "@/components/step-one-upload";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-8">
      <AppHeader />
      <header className="border-b border-[var(--color-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          피킹지시서 자동 분류·출력
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          SAP 작업 순서대로 단계별로 진행합니다. 각 단계에서 다음 SAP 작업에 붙여넣을
          값을 복사 버튼으로 제공합니다.
        </p>
      </header>

      <div className="rounded-md bg-slate-50 px-4 py-3 text-xs text-[var(--color-muted)]">
        <span className="font-medium text-slate-700">진행 단계 안내</span> — 1단계 파일을
        업로드하면 작업이 시작되고, 그 안에서 단계 표시줄/화살표로 자유롭게 이동할 수 있습니다.
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {[
            "① 1단계 업로드",
            "② 2단계(선택)",
            "③ PG 입력",
            "④ 출력1",
            "⑤ 3단계",
            "⑥ 4단계",
            "⑦ 인쇄/다운로드",
          ].map((s, i) => (
            <span key={s}>
              <span className={i === 0 ? "font-medium text-slate-900" : ""}>{s}</span>
              {i < 6 ? <span className="px-0.5">›</span> : null}
            </span>
          ))}
        </div>
      </div>

      <StepOneUpload />
    </main>
  );
}
