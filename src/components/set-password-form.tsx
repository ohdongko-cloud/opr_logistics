"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const MIN = 8;

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN && password === confirm && !busy;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        try {
          const res = await fetch("/api/auth/set-password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ password, confirm }),
          });
          if (res.status === 429) {
            toast.warning("잠시 후 다시 시도해주세요.");
            return;
          }
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg =
              body.error === "weak_password"
                ? "비밀번호는 8자 이상이어야 합니다."
                : body.error === "mismatch"
                  ? "비밀번호가 일치하지 않습니다."
                  : body.error === "unauthorized"
                    ? "세션이 만료되었습니다. 다시 로그인해주세요."
                    : "설정에 실패했습니다.";
            toast.error(msg);
            if (body.error === "unauthorized") router.push("/login");
            return;
          }
          toast.success("비밀번호가 설정되었습니다.");
          router.push("/");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">새 비밀번호</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          placeholder="8자 이상"
        />
        {tooShort && (
          <span className="text-xs text-rose-600">8자 이상 입력하세요.</span>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">비밀번호 확인</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
          placeholder="다시 입력"
        />
        {mismatch && (
          <span className="text-xs text-rose-600">비밀번호가 일치하지 않습니다.</span>
        )}
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "설정 중…" : "비밀번호 설정 후 시작"}
      </button>
    </form>
  );
}
