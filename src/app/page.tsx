import { UploadZone } from "@/components/upload-zone";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 p-8">
      <header className="border-b border-[var(--color-border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          피킹지시서 자동 분류·출력
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          RAW 엑셀 4개 (1단계·2단계·3단계·4단계)를 업로드하면 출력1·2·3 + ETC 리포트를
          자동 생성하고 A4 페이지로 분할해 인쇄/다운로드합니다.
        </p>
      </header>

      <ol className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <li className="font-medium text-slate-900">① 업로드</li>
        <li>→</li>
        <li>② 미리보기</li>
        <li>→</li>
        <li>③ PG 입력</li>
        <li>→</li>
        <li>④ 인쇄/다운로드</li>
      </ol>

      <UploadZone />
    </main>
  );
}
