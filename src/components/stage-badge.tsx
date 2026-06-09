import { cn } from "@/lib/utils";

const LABELS = {
  stage1: "1단계(STO)",
  stage2: "2단계(물류분배)",
  stage3: "3단계(피킹지시서패션)",
  stage4: "4단계(EAN)",
} as const;

export function StageBadge({
  stage,
  confidence,
  className,
}: {
  stage: keyof typeof LABELS | null;
  confidence: number;
  className?: string;
}) {
  if (!stage) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900",
          className
        )}
      >
        ⚠ 자동 인식 실패
      </span>
    );
  }
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 1
      ? "bg-emerald-100 text-emerald-900"
      : confidence >= 0.6
        ? "bg-sky-100 text-sky-900"
        : "bg-amber-100 text-amber-900";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        tone,
        className
      )}
    >
      <span aria-hidden>✓</span>
      {LABELS[stage]} {pct < 100 ? `(${pct}%)` : null}
    </span>
  );
}
