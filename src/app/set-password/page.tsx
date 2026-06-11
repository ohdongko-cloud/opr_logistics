/**
 * /set-password (PRD #0004 F7.3) — 로그인 세션 필요.
 * 최초 설정 / 분실 재설정 / 기존 사용자 전환 공용. (이 페이지는 비번 미설정도 접근 허용 — 루프 방지)
 */
import { redirect } from "next/navigation";

import { SetPasswordForm } from "@/components/set-password-form";
import { hasPassword } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const email = await getCurrentEmail();
  if (!email) redirect("/login");
  let isReset = false;
  try {
    isReset = await hasPassword(email);
  } catch {
    isReset = false; // 컬럼 미적용 등 — 설정 화면으로 표기
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">
          {isReset ? "비밀번호 재설정" : "비밀번호 설정"}
        </h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          <strong>{email}</strong> 계정의 비밀번호를 설정합니다. 다음 로그인부터는
          이메일 + 비밀번호로 로그인할 수 있습니다. (최소 8자)
        </p>
      </header>
      <SetPasswordForm />
    </main>
  );
}
