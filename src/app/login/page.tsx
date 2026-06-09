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
          허용된 이메일로만 로그인할 수 있습니다. 6자리 OTP가 발송됩니다.
        </p>
      </header>
      <LoginForm />
    </main>
  );
}
