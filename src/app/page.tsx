import { StepOneUpload } from "@/components/step-one-upload";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-8">
      <header className="border-b border-[var(--color-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          피킹지시서 자동 분류·출력
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          SAP 작업 순서대로 단계별로 진행합니다. 각 단계에서 다음 SAP 작업에 붙여넣을
          값을 복사 버튼으로 제공합니다.
        </p>
      </header>

      <ol className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
        <li className="font-medium text-slate-900">① 1단계 업로드</li>
        <li>›</li>
        <li>② 2단계(선택)</li>
        <li>›</li>
        <li>③ PG 입력</li>
        <li>›</li>
        <li>④ 출력1</li>
        <li>›</li>
        <li>⑤ 3단계</li>
        <li>›</li>
        <li>⑥ 4단계</li>
        <li>›</li>
        <li>⑦ 인쇄/다운로드</li>
      </ol>

      <StepOneUpload />
    </main>
  );
}
