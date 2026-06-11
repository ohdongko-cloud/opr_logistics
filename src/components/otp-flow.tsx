"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Mode = "signup" | "reset";

/**
 * 이메일 인증 흐름 (PRD #0004) — 최초 가입/전환(signup) 및 비밀번호 분실(reset) 공용.
 * 1) 이메일 입력 → send-otp  2) 코드 입력 → verify-otp
 * 검증 성공 후: reset이거나 비번 미설정이면 /set-password, 아니면 /.
 */
export function OtpFlow({
  mode,
  initialEmail,
}: {
  mode: Mode;
  initialEmail?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    if (!email) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        toast.warning(`잠시 후 다시 시도해주세요 (${body.retryAfterSeconds ?? 60}초).`);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code2 = body.error ?? res.statusText;
        const hint =
          code2 === "recipient_rejected"
            ? "수신측 메일서버가 거부했습니다 (스팸/정책)."
            : code2 === "smtp_auth_failed"
              ? "SMTP 자격증명 오류 — 앱 비밀번호를 확인하세요."
              : code2 === "smtp_connection_failed"
                ? "SMTP 서버에 연결 실패."
                : "메일 발송 실패";
        toast.error(hint);
        return;
      }
      toast.success("이메일을 확인해주세요. 6자리 코드가 발송되었습니다.");
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (res.ok) {
        const goSetup = mode === "reset" || body.needsPasswordSetup === true;
        toast.success(goSetup ? "인증되었습니다. 비밀번호를 설정하세요." : "로그인되었습니다.");
        router.push(goSetup ? "/set-password" : "/");
        router.refresh();
        return;
      }
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
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">이메일</span>
        <input
          type="email"
          required
          autoComplete="email"
          autoFocus={!initialEmail}
          value={email}
          disabled={sent}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm disabled:bg-slate-50"
          placeholder="you@eland.co.kr"
        />
      </label>

      {!sent ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={busy || !email}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "발송 중…" : "6자리 코드 받기"}
        </button>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
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
            {busy ? "확인 중…" : "인증"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
            }}
            className="text-center text-xs text-[var(--color-muted)] underline"
          >
            코드 다시 받기 / 이메일 변경
          </button>
        </form>
      )}

      <Link href="/login" className="text-center text-xs text-[var(--color-muted)] underline">
        비밀번호 로그인으로 돌아가기
      </Link>
    </div>
  );
}
