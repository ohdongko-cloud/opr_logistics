"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
import { StageUpload } from "@/components/stage-upload";

interface CopyColumn {
  key: string;
  label: string;
  values: string[];
  count: number;
}
export interface JobView {
  id: string;
  step:
    | "s1_uploaded"
    | "s2_uploaded"
    | "pg_entered"
    | "s3_uploaded"
    | "s4_uploaded"
    | "ready";
  screen: number;
  plnt: string;
  outletName: string;
  detectedPlants: string[];
  pgNumbers: Record<string, string>;
  headerOverrides: { docTitle?: string; deliveryDate?: string; footerLeft?: string };
  etcAcknowledged: boolean;
  expiresAt: string;
  totals: { stage1Y: number; output1Qty: number } | null;
  output1RowCount: number;
  output1Rows: Array<{
    purchaseGroup: string;
    plnt: string;
    outletName: string;
    qty: number;
    deliveryNo: string;
    pgNumber: string;
    brand: string;
  }>;
  warningsCount: number;
  warnings: string[];
  pageCount: number;
  etcCount: number;
  copy: CopyColumn[];
}

const STEPS = [
  "① 1단계 결과",
  "② 2단계(선택)",
  "③ PG 입력",
  "④ 출력1",
  "⑤ 3단계 업로드",
  "⑥ 4단계 업로드",
  "⑦ 최종",
];

/** 현재 step에서 이동 가능한 가장 먼 화면 인덱스 (부록 F) */
function furthestScreen(step: JobView["step"]): number {
  switch (step) {
    case "s1_uploaded":
    case "s2_uploaded":
      return 3; // 출력1 미리보기까지 열람 가능
    case "pg_entered":
      return 4; // 3단계 업로드
    case "s3_uploaded":
      return 5; // 4단계 업로드
    case "s4_uploaded":
    case "ready":
      return 6;
    default:
      return 0;
  }
}

/** 업로드/전이 직후 착지할 "지금 할 일" 화면 (furthest와 별개) */
function currentScreen(step: JobView["step"]): number {
  switch (step) {
    case "s1_uploaded":
      return 0; // 1단계 결과 — 분배번호·자재 복사
    case "s2_uploaded":
      return 2; // PG 입력
    case "pg_entered":
      return 3; // 출력1 + PG번호 복사
    case "s3_uploaded":
      return 4; // 자재코드 복사 + 4단계 업로드
    case "s4_uploaded":
    case "ready":
      return 6; // 최종
    default:
      return 0;
  }
}

export function JobFlow({ initialView }: { initialView: JobView }) {
  const router = useRouter();
  const [view, setView] = useState<JobView>(initialView);
  const furthest = furthestScreen(view.step);
  const [viewIdx, setViewIdx] = useState<number>(currentScreen(initialView.step));

  const refresh = (v: unknown) => {
    const nv = v as JobView;
    setView(nv);
    // 전이 후 "지금 할 일" 화면으로 이동
    setViewIdx(currentScreen(nv.step));
  };
  const goto = (i: number) => setViewIdx(Math.max(0, Math.min(furthest, i)));

  return (
    <div className="flex flex-col gap-6">
      <Progress current={viewIdx} furthest={furthest} onJump={goto} />

      {/* 좌우 이동 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goto(viewIdx - 1)}
          disabled={viewIdx <= 0}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          ‹ 이전
        </button>
        <span className="text-xs text-[var(--color-muted)]">
          {STEPS[viewIdx]} ({viewIdx + 1}/{STEPS.length})
        </span>
        <button
          type="button"
          onClick={() => goto(viewIdx + 1)}
          disabled={viewIdx >= furthest}
          className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
        >
          다음 ›
        </button>
      </div>

      <Screen view={view} idx={viewIdx} onDone={refresh} />

      {/* 이전 단계 수정 — 앞 RAW 재업로드 (무효화 강등, 확인 모달) */}
      {view.step !== "s1_uploaded" && view.step !== "s2_uploaded" && (
        <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            이전 단계 다시 업로드 (수정)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <StageUpload
              endpoint={`/api/jobs/${view.id}/stage?n=1`}
              label="1단계 재업로드 (전체 초기화)"
              hint="PG·출력1·2·3와 2~4단계가 모두 폐기되고 STEP1로 돌아갑니다."
              confirmMessage="1단계를 다시 올리면 입력한 PG번호와 생성된 출력1·2·3, 이후 단계 업로드가 모두 삭제됩니다. 계속할까요?"
              onDone={refresh}
            />
            {(view.step === "s3_uploaded" ||
              view.step === "s4_uploaded" ||
              view.step === "ready") && (
              <StageUpload
                endpoint={`/api/jobs/${view.id}/stage?n=3`}
                label="3단계 재업로드"
                hint="출력2·3와 4단계가 폐기되고 STEP5로 돌아갑니다."
                confirmMessage="3단계를 다시 올리면 출력2·3와 4단계 업로드가 삭제됩니다. 계속할까요?"
                onDone={refresh}
              />
            )}
          </div>
        </details>
      )}

      <button
        type="button"
        onClick={() => router.refresh()}
        className="self-start text-xs text-[var(--color-muted)] underline"
      >
        새로고침
      </button>
    </div>
  );
}

/** idx 화면 1개를 렌더 (부록 F — 도달 단계 자유 열람) */
function Screen({
  view,
  idx,
  onDone,
}: {
  view: JobView;
  idx: number;
  onDone: (v: unknown) => void;
}) {
  const col = (k: string) => view.copy.find((c) => c.key === k);
  const pgVals = Object.values(view.pgNumbers);

  switch (idx) {
    case 0:
      return (
        <Section title="STEP 1 — 물류분배 실행 입력값 복사">
          {col("distributionNo") && (
            <CopyButton label="분배번호" values={col("distributionNo")!.values} count={col("distributionNo")!.count} />
          )}
          {col("material") && (
            <CopyButton label="자재" values={col("material")!.values} count={col("material")!.count} />
          )}
          <Out1Summary view={view} />
        </Section>
      );
    case 1:
      return (
        <Section title="STEP 2 — 2단계(물류분배) 업로드 (선택)">
          <StageUpload
            endpoint={`/api/jobs/${view.id}/stage?n=2`}
            label="2단계 업로드"
            hint="SAP 물류분배 실행 후 받은 파일. 통합 엑셀 보존용. 건너뛰고 PG 입력으로 가도 됩니다."
            onDone={onDone}
          />
        </Section>
      );
    case 2:
      return (
        <Section title="STEP 3 — PG 생성 입력값 복사 + PG번호 입력">
          {col("distributionNo") && (
            <CopyButton label="분배번호 (PG생성용)" values={col("distributionNo")!.values} count={col("distributionNo")!.count} />
          )}
          <PgForm view={view} onDone={onDone} />
        </Section>
      );
    case 3:
      return (
        <Section title="STEP 4 — 출력1 미리보기 + 피킹지시서 출력 입력값">
          <Out1Summary view={view} showTable />
          {pgVals.length > 0 ? (
            <CopyButton label="PG번호 (피킹지시서 출력용)" values={pgVals} count={pgVals.length} deduped={false} />
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              PG번호 미입력 — ③ PG 입력 단계에서 입력하면 출력1에 반영됩니다.
            </p>
          )}
        </Section>
      );
    case 4:
      return (
        <Section title="STEP 5 — 3단계 업로드 + EAN 조회 입력값">
          {col("materialCode") ? (
            <CopyButton label="자재코드 (EAN 조회용)" values={col("materialCode")!.values} count={col("materialCode")!.count} />
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
              3단계 업로드 후 자재코드 복사 버튼이 나타납니다.
            </p>
          )}
          <StageUpload
            endpoint={`/api/jobs/${view.id}/stage?n=3`}
            label="3단계(피킹지시서패션) 업로드"
            hint="SAP 피킹지시서 출력 후 받은 파일."
            onDone={onDone}
          />
        </Section>
      );
    case 5:
      return (
        <Section title="STEP 6 — 4단계(EAN) 업로드">
          <StageUpload
            endpoint={`/api/jobs/${view.id}/stage?n=4`}
            label="4단계(EAN) 업로드"
            hint="SAP EAN 조회 후 받은 파일. 업로드 시 출력2·3 자동 생성."
            onDone={onDone}
          />
        </Section>
      );
    case 6:
    default:
      return (
        <Section title="STEP 7 — 최종">
          {view.step === "ready" ? (
            <>
              <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                출력2·3 생성 완료 — 페이지 {view.pageCount} · 자재 {view.output1RowCount} · ETC {view.etcCount}
              </div>
              <Link
                href={`/jobs/${view.id}/print`}
                className="self-start rounded-md bg-[var(--color-brand)] px-5 py-2 text-sm font-medium text-white"
              >
                인쇄 미리보기 / 다운로드 →
              </Link>
              <a
                href={`/api/jobs/${view.id}/download`}
                className="self-start rounded-md border border-[var(--color-border)] bg-white px-5 py-2 text-sm font-medium hover:bg-slate-50"
              >
                통합 엑셀 다운로드
              </a>
            </>
          ) : (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              4단계 업로드가 끝나면 출력2·3가 생성됩니다.
            </p>
          )}
        </Section>
      );
  }
}

function Progress({
  current,
  furthest,
  onJump,
}: {
  current: number;
  furthest: number;
  onJump: (i: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const reachable = i <= furthest;
        return (
        <li key={s}>
          <button
            type="button"
            onClick={() => reachable && onJump(i)}
            disabled={!reachable}
            className={
              i === current
                ? "rounded bg-slate-900 px-2 py-1 font-medium text-white"
                : reachable
                  ? "rounded px-2 py-1 font-medium text-slate-900 hover:bg-slate-100"
                  : "px-2 py-1 text-[var(--color-muted)] cursor-not-allowed"
            }
          >
            {s}
          </button>
          {i < STEPS.length - 1 ? (
            <span className="px-0.5 text-[var(--color-muted)]">›</span>
          ) : null}
        </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Out1Summary({ view, showTable }: { view: JobView; showTable?: boolean }) {
  if (!view.totals) return null;
  const ok = view.totals.stage1Y === view.totals.output1Qty;
  return (
    <div className="flex flex-col gap-2">
      <div className={`rounded-md px-3 py-2 text-xs ${ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
        출력1: {view.output1RowCount}행 · 수량합 {view.totals.output1Qty} (1단계 {view.totals.stage1Y}) {ok ? "✓ 정합" : "⚠ 불일치"}
        {view.warningsCount > 0 ? ` · 경고 ${view.warningsCount}` : ""}
      </div>
      {showTable && view.output1Rows.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100">
              <tr className="text-left">
                {["구매그룹", "플랜트", "출고지", "수량", "납품번호", "PG번호", "브랜드"].map((h) => (
                  <th key={h} className="px-2 py-1 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.output1Rows.map((r, i) => (
                <tr key={i} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1">{r.purchaseGroup}</td>
                  <td className="px-2 py-1">{r.plnt}</td>
                  <td className="px-2 py-1">{r.outletName}</td>
                  <td className="px-2 py-1 tabular-nums">{r.qty}</td>
                  <td className="px-2 py-1 tabular-nums">{r.deliveryNo}</td>
                  <td className="px-2 py-1 tabular-nums">{r.pgNumber || "—"}</td>
                  <td className="px-2 py-1">{r.brand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PgForm({ view, onDone }: { view: JobView; onDone: (v: unknown) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.detectedPlants.map((p) => [p, view.pgNumbers[p] ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const valid = view.detectedPlants.every((p) => /^\d{10}$/.test(vals[p] ?? ""));
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/jobs/${view.id}/pg`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pgNumbers: vals }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(`PG 저장 실패: ${body.error ?? res.statusText}`);
        return;
      }
      toast.success("PG번호 저장됨");
      onDone(body.view);
    } catch (e) {
      toast.error(`네트워크 오류: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {view.detectedPlants.map((p) => (
        <label key={p} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">플랜트 {p} PG번호</span>
          <input
            inputMode="numeric"
            maxLength={10}
            value={vals[p] ?? ""}
            onChange={(e) =>
              setVals((v) => ({ ...v, [p]: e.target.value.replace(/\D/g, "") }))
            }
            placeholder="10자리 숫자"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm tabular-nums"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={!valid || busy}
        onClick={save}
        className="self-start rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "저장 중…" : "PG번호 저장 + 출력1 생성"}
      </button>
    </div>
  );
}

