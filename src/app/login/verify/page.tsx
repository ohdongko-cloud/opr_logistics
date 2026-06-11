import { redirect } from "next/navigation";

import { OtpFlow } from "@/components/otp-flow";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; mode?: string }>;
}) {
  const session = await getCurrentEmail();
  if (session) redirect("/");
  const params = await searchParams;
  const mode = params.mode === "reset" ? "reset" : "signup";
  const email = params.email ?? "";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">
          {mode === "reset" ? "비밀번호 재설정" : "이메일 인증"}
        </h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {mode === "reset"
            ? "가입된 이메일로 인증 코드를 받아 본인 확인 후 새 비밀번호를 설정합니다."
            : "이메일로 6자리 인증 코드를 받아 본인 확인 후 비밀번호를 설정합니다."}{" "}
          유효시간 10분.
        </p>
      </header>
      <OtpFlow mode={mode} initialEmail={email} />
    </main>
  );
}
