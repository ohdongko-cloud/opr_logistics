/**
 * 헤더 → RAW 단계 자동 판별 (PRD §4.1 F1.2)
 *   - 시그니처 점수 = 매칭된 required 비율
 *   - 모두 매칭 (1.0) → 확정
 *   - 부분 매칭 + 2위와 격차 ≥ 0.2 → 잠정 확정
 *   - 그 외 → null (사용자 수동 지정 필요)
 */

import { normalizeForSig } from "./normalize";
import { ALL_STAGES, type RawStage, STAGE_SIGNATURES } from "./signatures";

export interface DetectionResult {
  stage: RawStage | null;
  confidence: number; // 0~1
  scores: Record<RawStage, number>;
  reason: string;
}

export function detectStage(
  headerCells: ReadonlyArray<string | number | null | undefined>
): DetectionResult {
  // 1) 헤더 셀들을 하나의 문자열로 합쳐(정규화 후) substring 검색 가능하게.
  const joined = headerCells
    .map((c) => (c === null || c === undefined ? "" : String(c)))
    .map(normalizeForSig)
    .filter(Boolean)
    .join("");

  const scores = {} as Record<RawStage, number>;
  for (const stage of ALL_STAGES) scores[stage] = 0;

  for (const sig of STAGE_SIGNATURES) {
    const matched = sig.required.filter((r) =>
      joined.includes(normalizeForSig(r))
    ).length;
    scores[sig.stage] = matched / sig.required.length;
  }

  const sorted = (Object.entries(scores) as [RawStage, number][]).sort(
    (a, b) => b[1] - a[1]
  );
  const [bestStage, bestScore] = sorted[0]!;
  const [, secondScore] = sorted[1]!;

  if (bestScore >= 1) {
    return {
      stage: bestStage,
      confidence: bestScore,
      scores,
      reason: `100% match for ${bestStage}`,
    };
  }
  if (bestScore >= 0.6 && bestScore - secondScore >= 0.2) {
    return {
      stage: bestStage,
      confidence: bestScore,
      scores,
      reason: `partial match (${Math.round(bestScore * 100)}%) with clear lead over runner-up (${Math.round(secondScore * 100)}%)`,
    };
  }
  return {
    stage: null,
    confidence: bestScore,
    scores,
    reason: `ambiguous: top=${Math.round(bestScore * 100)}%, runner-up=${Math.round(secondScore * 100)}%`,
  };
}
