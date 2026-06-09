"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { StageBadge } from "@/components/stage-badge";
import { cn } from "@/lib/utils";
import type { RawStage } from "@/lib/parser/signatures";

const STAGE_LABELS: Record<RawStage, string> = {
  stage1: "1단계 (STO)",
  stage2: "2단계 (물류분배)",
  stage3: "3단계 (피킹지시서패션)",
  stage4: "4단계 (EAN)",
};

type SlotInfo = {
  fileIndex: number | null;
  sheetName: string | null;
  rowCount: number | null;
};

type FileSummary = {
  fileIndex: number;
  filename: string;
  sizeBytes: number;
  sheets: Array<{
    sheetName: string;
    headerRow: number;
    stage: RawStage | null;
    confidence: number;
    rowCount: number;
  }>;
  errors: string[];
};

type UploadResponse = {
  files: FileSummary[];
  slots: Record<RawStage, SlotInfo>;
  missing: RawStage[];
  conflicts: Array<{ stage: RawStage; fileIndices: number[] }>;
  combinedFileIndex: number | null;
};

export function UploadZone() {
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = useCallback(() => inputRef.current?.click(), []);

  const onFilesChosen = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const next = [...pendingFiles, ...arr].slice(0, 4);
      if (arr.length + pendingFiles.length > 4) {
        toast.warning("최대 4개 파일까지만 추가됩니다.");
      }
      setPendingFiles(next);
      setResult(null);
    },
    [pendingFiles]
  );

  const removeFile = useCallback((idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  }, []);

  const onSubmit = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      for (const f of pendingFiles) form.append("files", f);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        toast.error(`업로드 실패: ${body.error ?? res.statusText}`);
        return;
      }
      const json = (await res.json()) as UploadResponse;
      setResult(json);
      if (json.missing.length > 0) {
        toast.warning(
          `자동 인식되지 않은 단계: ${json.missing.map((m) => STAGE_LABELS[m]).join(", ")}`
        );
      } else {
        toast.success("4개 단계 모두 자동 인식되었습니다.");
      }
    } catch (err) {
      toast.error(`네트워크 오류: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }, [pendingFiles]);

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files) onFilesChosen(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-10 text-center transition-colors hover:bg-slate-50"
        )}
      >
        <p className="text-base font-medium">
          RAW 엑셀(.xlsx) 1~4개를 드래그&드롭
        </p>
        <p className="text-xs text-[var(--color-muted)]">
          파일명·시트명은 무관. 헤더 컬럼으로 자동 단계 판별됩니다.
        </p>
        <button
          type="button"
          onClick={onPick}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          파일 선택
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          hidden
          onChange={(e) => e.target.files && onFilesChosen(e.target.files)}
        />
      </div>

      {pendingFiles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pendingFiles.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm"
            >
              <span className="truncate">
                {f.name}{" "}
                <span className="text-xs text-[var(--color-muted)]">
                  ({(f.size / 1024 / 1024).toFixed(2)}MB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-xs text-rose-600 hover:underline"
                aria-label={`${f.name} 제거`}
              >
                제거
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={busy || pendingFiles.length === 0}
          onClick={onSubmit}
          className="rounded-md bg-[var(--color-brand)] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "분석 중…" : "단계 자동 판별"}
        </button>
      </div>

      {result && (
        <section className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-6">
          <h3 className="text-lg font-semibold">슬롯 자동 배정 결과</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["stage1", "stage2", "stage3", "stage4"] as RawStage[]).map(
              (stage) => {
                const slot = result.slots[stage];
                const file =
                  slot.fileIndex !== null
                    ? result.files[slot.fileIndex]
                    : undefined;
                const sheetDet = file?.sheets.find(
                  (s) => s.stage === stage && s.sheetName === slot.sheetName
                );
                return (
                  <div
                    key={stage}
                    className={cn(
                      "rounded-lg border p-4 text-sm",
                      slot.fileIndex !== null
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-amber-200 bg-amber-50"
                    )}
                  >
                    <div className="font-medium">{STAGE_LABELS[stage]}</div>
                    <div className="mt-1">
                      <StageBadge
                        stage={slot.fileIndex !== null ? stage : null}
                        confidence={sheetDet?.confidence ?? 0}
                      />
                    </div>
                    {file && (
                      <div className="mt-2 text-xs text-[var(--color-muted)]">
                        <div className="truncate">파일: {file.filename}</div>
                        <div>시트: {slot.sheetName ?? "—"}</div>
                        <div>행 수: {slot.rowCount ?? "—"}</div>
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>

          {result.combinedFileIndex !== null && (
            <p className="text-xs text-[var(--color-muted)]">
              ℹ︎ 한 파일에 1~4단계 시트가 모두 포함되어 있습니다. 통합 파일로 처리.
            </p>
          )}

          {result.missing.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              자동 인식 실패 단계:{" "}
              <strong>
                {result.missing.map((m) => STAGE_LABELS[m]).join(", ")}
              </strong>{" "}
              — 수동 지정 UI는 다음 커밋에서 추가됩니다.
            </p>
          )}
          {result.conflicts.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              중복 매칭:{" "}
              {result.conflicts
                .map(
                  (c) =>
                    `${STAGE_LABELS[c.stage]} (파일 ${c.fileIndices.join(", ")})`
                )
                .join("; ")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
