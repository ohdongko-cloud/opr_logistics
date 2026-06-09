"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (code.length !== 6) return;
          setBusy(true);
          try {
            const res = await fetch("/api/auth/verify-otp", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ email, code }),
            });
            if (res.ok) {
              toast.success("로그인되었습니다.");
              router.push("/");
              router.refresh();
              return;
            }
            const body = await res.json().catch(() => ({ error: res.statusText }));
            const msg =
              body.error === "expired"
                ? "코드가 만료되었습니다. 다시 받아주세요."
                : body.error === "too_many_attempts"
                  ? "시도 횟수 초과. 다시 받아주세요."
                  : "코드가 일치하지 않습니다.";
            toast.error(msg);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">6자리 코드</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-center text-xl tracking-[0.6em] font-mono"
            placeholder="000000"
          />
        </label>
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
      </form>
      <Link
        href="/login"
        className="text-center text-xs text-[var(--color-muted)] underline"
      >
        다른 이메일로 다시 보내기
      </Link>
    </>
  );
}
