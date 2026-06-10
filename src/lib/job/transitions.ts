/**
 * 잡 단계 상태 머신 (PRD #0002 §4.1 F1 / 부록 D)
 *
 * 합법 전이만 허용. 비순차 전이는 호출자가 409로 거부.
 */

export type JobStep =
  | "s1_uploaded"
  | "s2_uploaded"
  | "pg_entered"
  | "s3_uploaded"
  | "s4_uploaded"
  | "ready";

export const JOB_STEPS: JobStep[] = [
  "s1_uploaded",
  "s2_uploaded",
  "pg_entered",
  "s3_uploaded",
  "s4_uploaded",
  "ready",
];

/** 합법 전이 매트릭스. null = 잡 생성(전 단계 없음) */
const LEGAL: Record<string, JobStep[]> = {
  __create__: ["s1_uploaded"],
  s1_uploaded: ["s2_uploaded", "pg_entered"], // STEP2 선택 — 직행 허용
  s2_uploaded: ["pg_entered"],
  pg_entered: ["s3_uploaded"],
  s3_uploaded: ["s4_uploaded"],
  s4_uploaded: ["ready"],
  ready: [], // 종착 (재업로드 강등은 별도)
};

export function canTransition(
  from: JobStep | null,
  to: JobStep
): boolean {
  const key = from ?? "__create__";
  return (LEGAL[key] ?? []).includes(to);
}

/**
 * 앞 단계 RAW 재업로드 시 강등 대상 step (부록 D 무효화 표).
 * stage: 재업로드하는 단계 (1=STEP1, 3=STEP5, 4=STEP6)
 * 반환: 강등 후 step + 폐기할 데이터 키 목록
 */
export interface InvalidationResult {
  demoteTo: JobStep;
  discard: Array<"pgNumbers" | "output1" | "outputs23" | "stage2" | "stage3" | "stage4">;
}

export function invalidationFor(stage: 1 | 3 | 4): InvalidationResult {
  switch (stage) {
    case 1:
      return {
        demoteTo: "s1_uploaded",
        discard: ["pgNumbers", "output1", "outputs23", "stage2", "stage3", "stage4"],
      };
    case 3:
      return { demoteTo: "s3_uploaded", discard: ["outputs23", "stage4"] };
    case 4:
      return { demoteTo: "s4_uploaded", discard: ["outputs23"] };
  }
}

/** step → 사용자가 봐야 할 화면 단계(1~8) */
export function stepToScreen(step: JobStep | null): number {
  switch (step) {
    case null:
    case "s1_uploaded":
      return 2; // STEP2 (또는 PG로 진행)
    case "s2_uploaded":
      return 3;
    case "pg_entered":
      return 4;
    case "s3_uploaded":
      return 6;
    case "s4_uploaded":
      return 7;
    case "ready":
      return 8;
    default:
      return 1;
  }
}
