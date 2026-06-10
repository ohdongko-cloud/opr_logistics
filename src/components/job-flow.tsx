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
  warningsCount: number;
  pageCount: number;
  etcCount: number;
  copy: CopyColumn[];
}

const STEPS = [
  "① 1단계 업로드",
  "② 2단계(선택)",
  "③ PG 입력",
  "④ 출력1",
  "⑤ 3단계 업로드",
  "⑥ 4단계 업로드",
  "⑦ 최종 미리보기",
];

export function JobFlow({ initialView }: { initialView: JobView }) {
  const router = useRouter();
  const [view, setView] = useState<JobView>(initialView);
  const col = (k: string) => view.copy.find((c) => c.key === k);

  const refresh = (v: unknown) => setView(v as JobView);

  return (
    <div className="flex flex-col gap-6">
      <Progress step={view.step} />

      {/* STEP1 완료 후: 분배번호/자재 복사 + 2단계 업로드 or PG로 */}
      {view.step === "s1_uploaded" && (
        <Section title="STEP 1 완료 — 물류분배 실행 입력값 복사">
          {col("distributionNo") && (
            <CopyButton
              label="분배번호"
              values={col("distributionNo")!.values}
              count={col("distributionNo")!.count}
            />
          )}
          {col("material") && (
            <CopyButton
              label="자재"
              values={col("material")!.values}
              count={col("material")!.count}
            />
          )}
          <Out1Summary view={view} />
          <div className="grid gap-3 sm:grid-cols-2">
            <StageUpload
              endpoint={`/api/jobs/${view.id}/stage?n=2`}
              label="STEP 2: 2단계(물류분배) 업로드 (선택)"
              hint="SAP 물류분배 실행 후 받은 파일. 통합 엑셀 보존용."
              onDone={refresh}
            />
            <SkipToPg view={view} onDone={refresh} />
          </div>
        </Section>
      )}

      {/* STEP2 완료 후: PG 입력 */}
      {view.step === "s2_uploaded" && (
        <Section title="STEP 3 — PG 생성 입력값 복사 + PG번호 입력">
          {col("distributionNo") && (
            <CopyButton
              label="분배번호 (PG생성용)"
              values={col("distributionNo")!.values}
              count={col("distributionNo")!.count}
            />
          )}
          <PgForm view={view} onDone={refresh} />
        </Section>
      )}

      {/* PG 입력됨: 출력1 미리보기 + PG 복사 + 3단계 업로드 */}
      {view.step === "pg_entered" && (
        <Section title="STEP 4 — 출력1 미리보기 + 피킹지시서 출력 입력값">
          <Out1Summary view={view} />
          <CopyButton
            label="PG번호 (피킹지시서 출력용)"
            values={Object.values(view.pgNumbers)}
            count={Object.values(view.pgNumbers).length}
          />
          <StageUpload
            endpoint={`/api/jobs/${view.id}/stage?n=3`}
            label="STEP 5: 3단계(피킹지시서패션) 업로드"
            hint="SAP 피킹지시서 출력 후 받은 파일."
            onDone={refresh}
          />
        </Section>
      )}

      {/* 3단계 완료: 자재코드 복사 + 4단계 업로드 */}
      {view.step === "s3_uploaded" && (
        <Section title="STEP 5 완료 — EAN 조회 입력값 복사">
          {col("materialCode") && (
            <CopyButton
              label="자재코드 (EAN 조회용)"
              values={col("materialCode")!.values}
              count={col("materialCode")!.count}
            />
          )}
          <StageUpload
            endpoint={`/api/jobs/${view.id}/stage?n=4`}
            label="STEP 6: 4단계(EAN) 업로드"
            hint="SAP EAN 조회 후 받은 파일. 업로드 시 출력2·3 자동 생성."
            onDone={refresh}
          />
        </Section>
      )}

      {/* 완료: 최종 미리보기 링크 */}
      {(view.step === "s4_uploaded" || view.step === "ready") && (
        <Section title="STEP 7 — 완료">
          <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            출력2·3 생성 완료 — 페이지 {view.pageCount} · 자재 {view.output1RowCount} ·
            ETC {view.etcCount}
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
        </Section>
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

function Progress({ step }: { step: JobView["step"] }) {
  const order = ["s1_uploaded", "s2_uploaded", "pg_entered", "s3_uploaded", "s4_uploaded", "ready"];
  const idx = order.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li
          key={s}
          className={
            i <= idx
              ? "font-medium text-slate-900"
              : "text-[var(--color-muted)]"
          }
        >
          {s}
          {i < STEPS.length - 1 ? " ›" : ""}
        </li>
      ))}
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

function Out1Summary({ view }: { view: JobView }) {
  if (!view.totals) return null;
  const ok = view.totals.stage1Y === view.totals.output1Qty;
  return (
    <div className={`rounded-md px-3 py-2 text-xs ${ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
      출력1: {view.output1RowCount}행 · 수량합 {view.totals.output1Qty} (1단계 {view.totals.stage1Y}) {ok ? "✓ 정합" : "⚠ 불일치"}
      {view.warningsCount > 0 ? ` · 경고 ${view.warningsCount}` : ""}
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

function SkipToPg({ view, onDone }: { view: JobView; onDone: (v: unknown) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <p className="text-sm font-medium">2단계 건너뛰기</p>
      <p className="text-xs text-[var(--color-muted)]">
        2단계는 통합 엑셀 보존용입니다. 바로 PG 입력으로 진행할 수 있습니다.
      </p>
      <PgForm view={view} onDone={onDone} />
    </div>
  );
}
