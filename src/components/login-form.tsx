"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** 이메일 + 비밀번호 로그인 (PRD #0004). 최초/분실은 OTP 경로 링크로. */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const emailQ = encodeURIComponent(email.trim().toLowerCase());

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email || !password) return;
        setBusy(true);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (res.status === 429) {
            const body = await res.json().catch(() => ({}));
            toast.warning(
              `로그인 시도가 많습니다. 잠시 후 다시 시도해주세요 (${body.retryAfterSeconds ?? 60}초).`
            );
            return;
          }
          if (!res.ok) {
            toast.error("이메일 또는 비밀번호가 올바르지 않습니다.");
            return;
          }
          toast.success("로그인되었습니다.");
          router.push("/");
          router.refresh();
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
          placeholder="you@eland.co.kr"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">비밀번호</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          placeholder="비밀번호"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !email || !password}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "로그인 중…" : "로그인"}
      </button>

      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <Link
          href={`/login/verify?mode=signup${email ? `&email=${emailQ}` : ""}`}
          className="underline"
        >
          처음이신가요? 이메일 인증으로 시작
        </Link>
        <Link
          href={`/login/verify?mode=reset${email ? `&email=${emailQ}` : ""}`}
          className="underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </div>
    </form>
  );
}
