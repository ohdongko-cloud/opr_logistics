"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email) return;
        setBusy(true);
        try {
          const res = await fetch("/api/auth/send-otp", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email }),
          });
          if (res.status === 429) {
            const body = await res.json();
            toast.warning(
              `잠시 후 다시 시도해주세요 (${body.retryAfterSeconds}초 남음)`
            );
            return;
          }
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast.error(`발송 실패: ${body.error ?? res.statusText}`);
            return;
          }
          toast.success("이메일을 확인해주세요. 6자리 코드가 발송되었습니다.");
          router.push(
            `/login/verify?email=${encodeURIComponent(email.trim().toLowerCase())}`
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">이메일</span>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          placeholder="you@gmail.com"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !email}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "발송 중…" : "6자리 코드 받기"}
      </button>
    </form>
  );
}
