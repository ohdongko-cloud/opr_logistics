import { AppHeader } from "@/components/app-header";
import { HomeFlow } from "@/components/home-flow";
import { enforcePasswordSet } from "@/lib/auth/page-guard";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // 로그인했으나 비밀번호 미설정이면 /set-password로 강제 (PRD #0004 F6)
  await enforcePasswordSet(await getCurrentEmail());
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

      <HomeFlow />
    </main>
  );
}
