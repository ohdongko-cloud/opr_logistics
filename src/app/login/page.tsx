import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const email = await getCurrentEmail();
  if (email) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">로그인</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          이메일과 비밀번호로 로그인하세요. 처음이거나 비밀번호를 잊으셨다면 아래
          링크로 이메일 인증을 진행하세요.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}
