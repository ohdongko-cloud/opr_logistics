import { redirect } from "next/navigation";

import { VerifyForm } from "@/components/verify-form";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await getCurrentEmail();
  if (session) redirect("/");
  const params = await searchParams;
  const email = params.email ?? "";
  if (!email) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold">코드 입력</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          <strong>{email}</strong> 으로 발송된 6자리 코드를 입력하세요. 유효시간 10분.
        </p>
      </header>
      <VerifyForm email={email} />
    </main>
  );
}
