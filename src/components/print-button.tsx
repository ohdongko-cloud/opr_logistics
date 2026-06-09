"use client";

/** 인쇄 트리거 — Server Component인 미리보기 페이지에서 사용. */
export function PrintButton({
  label = "인쇄",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      }
    >
      {label}
    </button>
  );
}
