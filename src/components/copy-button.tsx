"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * SAP 붙여넣기용 컬럼 복사 버튼 (PRD #0002 §4.9 F9).
 * 값들을 CRLF(\r\n)로 이어붙여 복사 → SAP/엑셀에 세로 행으로 한 줄씩 들어간다.
 * (개행 포맷 선택은 혼선을 줄이기 위해 제거 — CRLF 고정)
 */
export function CopyButton({
  label,
  values,
  count,
  deduped = true,
}: {
  label: string;
  values: string[];
  count: number;
  deduped?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  const doCopy = async () => {
    const text = values.join("\r\n"); // 세로 행 — 각 값이 행 바뀌며 들어감
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setFallback(null);
        toast.success(`${label} ${count}건 복사됨`);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
      throw new Error("clipboard_unavailable");
    } catch {
      // fallback: textarea 노출 → 수동 Ctrl+C
      setFallback(text);
      toast.warning("자동 복사 불가 — 아래 영역을 전체 선택해 Ctrl+C 하세요");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-medium">{label}</span>{" "}
          <span className="text-xs text-[var(--color-muted)]">
            ({count}건{deduped ? ", 중복제거" : ""})
          </span>
        </div>
        <button
          type="button"
          onClick={doCopy}
          aria-live="polite"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          {copied ? "복사됨 ✓" : "전체 복사"}
        </button>
      </div>
      {fallback !== null && (
        <textarea
          readOnly
          value={fallback}
          onFocus={(e) => e.currentTarget.select()}
          rows={4}
          className="w-full rounded border border-[var(--color-border)] p-2 font-mono text-xs"
        />
      )}
    </div>
  );
}
