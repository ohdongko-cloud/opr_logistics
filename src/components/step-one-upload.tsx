"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

/** STEP1: 1단계(STO) 업로드 → 잡 생성 → /jobs/[id] 이동 */
export function StepOneUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/jobs", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`업로드 실패: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("1단계 업로드 완료");
      router.push(`/jobs/${body.jobId}`);
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
      className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-10 text-center"
    >
      <p className="text-base font-medium">STEP 1 — 1단계(STO) 파일 업로드</p>
      <p className="text-xs text-[var(--color-muted)]">
        SAP STO 대량생성에서 받은 .xlsx 파일을 드래그&드롭하거나 선택하세요.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-[var(--color-brand)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "업로드 중…" : "1단계 파일 선택"}
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
