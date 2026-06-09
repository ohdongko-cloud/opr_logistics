"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { PG_REGEX } from "@/lib/pg";

interface Props {
  jobId: string;
  plants: string[];
  initial: Record<string, string>;
}

export function PgInputForm({ jobId, plants, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const p of plants) v[p] = initial[p] ?? "";
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const persist = useCallback(
    async (next: Record<string, string>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pgNumbers: next }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          toast.error(`저장 실패: ${body.error}`);
        }
      } finally {
        setSaving(false);
      }
    },
    [jobId]
  );

  const handleBlur = useCallback(
    (plnt: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed && !PG_REGEX.test(trimmed)) {
        setErrors((e) => ({ ...e, [plnt]: "10자리 숫자만 가능합니다" }));
        return;
      }
      setErrors((e) => {
        const next = { ...e };
        delete next[plnt];
        return next;
      });
      const next = { ...values, [plnt]: trimmed };
      setValues(next);
      void persist(next);
    },
    [persist, values]
  );

  const allValid =
    plants.every((p) => PG_REGEX.test(values[p] ?? "")) &&
    Object.keys(errors).length === 0;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!allValid) {
          toast.error("모든 플랜트에 유효한 PG번호를 입력하세요");
          return;
        }
        router.push(`/jobs/${jobId}`);
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        {plants.map((p) => (
          <label
            key={p}
            className="flex flex-col gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            <span className="text-sm font-medium">플랜트 {p}</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              defaultValue={values[p] ?? ""}
              placeholder="10자리 숫자 (예: 1000191008)"
              onBlur={(e) => handleBlur(p, e.target.value)}
              className={`mt-1 rounded-md border px-3 py-2 text-sm tabular-nums ${
                errors[p]
                  ? "border-rose-400 bg-rose-50"
                  : "border-[var(--color-border)] bg-white"
              }`}
              aria-invalid={!!errors[p]}
              aria-describedby={`err-${p}`}
            />
            {errors[p] && (
              <span id={`err-${p}`} className="text-xs text-rose-600">
                {errors[p]}
              </span>
            )}
          </label>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        {saving && (
          <span className="text-xs text-[var(--color-muted)]">자동 저장 중…</span>
        )}
        <button
          type="submit"
          disabled={!allValid}
          className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          인쇄 미리보기로 →
        </button>
      </div>
    </form>
  );
}
