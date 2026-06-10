"use client";

import { useState } from "react";
import { toast } from "sonner";

type NewlineFormat = "LF" | "CRLF" | "TAB_CRLF";

function joinFmt(values: string[], fmt: NewlineFormat): string {
  const sep = fmt === "LF" ? "\n" : fmt === "CRLF" ? "\r\n" : "\t\r\n";
  return values.join(sep);
}

/** SAP 붙여넣기용 컬럼 복사 버튼 (PRD #0002 §4.9 F9) */
export function CopyButton({
  label,
  values,
  count,
  deduped = true,
  defaultFormat = "CRLF",
}: {
  label: string;
  values: string[];
  count: number;
  deduped?: boolean;
  defaultFormat?: NewlineFormat;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [fmt, setFmt] = useState<NewlineFormat>(defaultFormat);

  const doCopy = async () => {
    const text = joinFmt(values, fmt);
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
        <div className="flex items-center gap-2">
          <select
            value={fmt}
            onChange={(e) => setFmt(e.target.value as NewlineFormat)}
            className="rounded border border-[var(--color-border)] px-1 py-0.5 text-xs"
            title="SAP 붙여넣기 개행 포맷"
            aria-label="개행 포맷"
          >
            <option value="CRLF">CRLF</option>
            <option value="LF">LF</option>
            <option value="TAB_CRLF">탭+CRLF</option>
          </select>
          <button
            type="button"
            onClick={doCopy}
            aria-live="polite"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {copied ? "복사됨 ✓" : "전체 복사"}
          </button>
        </div>
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
