/**
 * PG번호 검증 (PRD §4.7 F7 / AC10 / AC18)
 *   - 정규식: ^\d{10}$
 *   - 플랜트별 일관성: 한 plnt에는 정확히 1개의 PG번호만
 */

export const PG_REGEX = /^\d{10}$/;

export interface PgValidationIssue {
  level: "error";
  code: "invalid_format" | "missing" | "plant_inconsistency";
  plnt?: string;
  detail: string;
}

export function isValidPg(pg: string | null | undefined): boolean {
  if (!pg) return false;
  return PG_REGEX.test(pg);
}

/** 플랜트별 PG 입력값을 검증 */
export function validatePgInputs(
  detectedPlants: ReadonlyArray<string>,
  pgInputs: Record<string, string>
): PgValidationIssue[] {
  const issues: PgValidationIssue[] = [];
  for (const plnt of detectedPlants) {
    const pg = (pgInputs[plnt] ?? "").trim();
    if (!pg) {
      issues.push({
        level: "error",
        code: "missing",
        plnt,
        detail: `플랜트 ${plnt}의 PG번호가 입력되지 않았습니다.`,
      });
      continue;
    }
    if (!PG_REGEX.test(pg)) {
      issues.push({
        level: "error",
        code: "invalid_format",
        plnt,
        detail: `플랜트 ${plnt}의 PG번호 '${pg}'는 10자리 숫자 형식이 아닙니다.`,
      });
    }
  }
  return issues;
}

/**
 * 한 플랜트에 서로 다른 PG가 두 번 들어오는 경우 검출.
 * 단일 입력값 안에선 이미 1개이므로 multi-source(예: 이전 잡 + 현재) 비교용.
 */
export function detectPlantPgConflict(
  current: Record<string, string>,
  candidate: Record<string, string>
): PgValidationIssue[] {
  const issues: PgValidationIssue[] = [];
  for (const [plnt, pg] of Object.entries(candidate)) {
    const prior = current[plnt];
    if (prior && prior !== pg) {
      issues.push({
        level: "error",
        code: "plant_inconsistency",
        plnt,
        detail: `플랜트 ${plnt}에 서로 다른 PG (${prior} ≠ ${pg}) 가 들어왔습니다.`,
      });
    }
  }
  return issues;
}
