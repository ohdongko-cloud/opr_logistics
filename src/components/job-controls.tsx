"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  jobId: string;
  initialOverrides: {
    docTitle?: string;
    deliveryDate?: string;
    footerLeft?: string;
  };
  initialEtcAck: boolean;
  etcCount: number;
  pgComplete: boolean;
  detectedPlants: string[];
}

export function JobControls({
  jobId,
  initialOverrides,
  initialEtcAck,
  etcCount,
  pgComplete,
  detectedPlants,
}: Props) {
  const [overrides, setOverrides] = useState(initialOverrides);
  const [etcAck, setEtcAck] = useState(initialEtcAck);
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    async (body: object) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({ error: res.statusText }));
          toast.error(`저장 실패: ${b.error}`);
        }
      } finally {
        setSaving(false);
      }
    },
    [jobId]
  );

  const onHeaderBlur = useCallback(
    (field: "docTitle" | "deliveryDate" | "footerLeft", value: string) => {
      const next = { ...overrides, [field]: value };
      setOverrides(next);
      void patch({ headerOverrides: { [field]: value } });
    },
    [overrides, patch]
  );

  const onEtcToggle = useCallback(
    (checked: boolean) => {
      setEtcAck(checked);
      void patch({ etcAcknowledged: checked });
    },
    [patch]
  );

  // 인쇄 단축키 안내 (의도된 클릭만 처리)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "p") {
        // 우선순위: ETC 미체크면 막기
        if (etcCount > 0 && !etcAck) {
          e.preventDefault();
          toast.warning(`ETC ${etcCount}건 확인 체크박스를 먼저 선택하세요`);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [etcAck, etcCount]);

  const printDisabled = etcCount > 0 && !etcAck;

  return (
    <div className="no-print flex flex-col gap-4">
      {/* 머리글 인라인 편집 */}
      <div className="grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-muted)]">문서명</span>
          <input
            type="text"
            defaultValue={overrides.docTitle ?? ""}
            placeholder="피킹지시서 - 강서점 데일리 필업(O구매그룹)"
            onBlur={(e) => onHeaderBlur("docTitle", e.target.value)}
            className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-muted)]">출고요청일</span>
          <input
            type="text"
            defaultValue={overrides.deliveryDate ?? ""}
            placeholder="2026.06.09"
            onBlur={(e) => onHeaderBlur("deliveryDate", e.target.value)}
            className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--color-muted)]">바닥글(좌)</span>
          <input
            type="text"
            defaultValue={overrides.footerLeft ?? ""}
            placeholder="0609_강서점 데일리 필업_O구매그룹"
            onBlur={(e) => onHeaderBlur("footerLeft", e.target.value)}
            className="rounded border border-[var(--color-border)] bg-white px-2 py-1 text-sm"
          />
        </label>
      </div>

      {/* ETC 확인 체크박스 */}
      {etcCount > 0 && (
        <label className="flex cursor-pointer items-center gap-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={etcAck}
            onChange={(e) => onEtcToggle(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            ETC 리포트 <strong>{etcCount}건</strong> 확인했습니다. (인쇄 페이지에
            포함되지 않으므로 별도로 확인 필요)
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saving && (
          <span className="text-xs text-[var(--color-muted)]">자동 저장 중…</span>
        )}
        {!pgComplete && detectedPlants.length > 0 && (
          <Link
            href={`/jobs/${jobId}/pg`}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            PG번호 입력 →
          </Link>
        )}
        <a
          href={`/api/jobs/${jobId}/download`}
          className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          통합 엑셀 다운로드
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printDisabled}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          title={printDisabled ? "ETC 확인 체크박스를 선택하세요" : undefined}
        >
          인쇄 (Ctrl+P)
        </button>
      </div>
    </div>
  );
}
