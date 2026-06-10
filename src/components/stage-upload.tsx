"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

/** 단일 .xlsx 업로드 → 지정 엔드포인트 POST. 성공 시 onDone(view) */
export function StageUpload({
  endpoint,
  label,
  hint,
  onDone,
  confirmMessage,
}: {
  endpoint: string;
  label: string;
  hint?: string;
  onDone: (view: unknown) => void;
  /** 지정 시 업로드 전 확인 모달(무효화 경고) */
  confirmMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async (file: File) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`업로드 실패: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success(`${label} 처리 완료`);
      onDone(body.view ?? body);
    } catch (e) {
      toast.error(`네트워크 오류: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) submit(f);
      }}
      className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center"
    >
      <p className="text-sm font-medium">{label}</p>
      {hint && <p className="text-xs text-[var(--color-muted)]">{hint}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "처리 중…" : ".xlsx 파일 선택"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) submit(f);
        }}
      />
    </div>
  );
}
