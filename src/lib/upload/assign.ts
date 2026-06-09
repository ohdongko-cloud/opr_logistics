/**
 * 업로드된 N개 파일을 4개 단계 슬롯에 배정 (PRD §4.1 F1.3)
 *
 * 입력: 각 파일에서 (가장 높은 confidence) 단계 자동 판별 결과
 * 출력: stage1~stage4 → fileIndex 매핑, 충돌/누락 정보
 */

import type { RawStage } from "../parser/signatures";
import { ALL_STAGES } from "../parser/signatures";

export interface FileDetection {
  fileIndex: number;
  filename: string;
  /** 시트별로 측정된 best detection (헤더 매칭) */
  bestStage: RawStage | null;
  bestConfidence: number;
  /** 시트별 detection 후보 — 통합 1파일에서 4개 시트가 모두 감지될 수 있음 */
  stageCandidates: Array<{ stage: RawStage; confidence: number; sheetName: string }>;
}

export interface AssignmentResult {
  /** stage → fileIndex */
  assignment: Partial<Record<RawStage, number>>;
  /** 채워지지 않은 단계 */
  missing: RawStage[];
  /** 같은 단계에 둘 이상 매칭된 케이스 */
  conflicts: Array<{ stage: RawStage; fileIndices: number[] }>;
  /** 한 파일에 1~4단계가 모두 들어있는 통합 파일 인덱스 */
  combinedFileIndex: number | null;
}

export function assignSlots(
  detections: ReadonlyArray<FileDetection>
): AssignmentResult {
  // 1) 한 파일에 4단계 모두 있는 통합 파일 우선 처리
  let combinedFileIndex: number | null = null;
  for (const d of detections) {
    const stagesInFile = new Set(d.stageCandidates.map((c) => c.stage));
    if (
      stagesInFile.size === 4 &&
      ALL_STAGES.every((s) => stagesInFile.has(s))
    ) {
      combinedFileIndex = d.fileIndex;
      break;
    }
  }

  const assignment: Partial<Record<RawStage, number>> = {};
  const stageToFiles: Record<RawStage, number[]> = {
    stage1: [],
    stage2: [],
    stage3: [],
    stage4: [],
  };

  if (combinedFileIndex !== null) {
    for (const s of ALL_STAGES) assignment[s] = combinedFileIndex;
  } else {
    // 2) 개별 파일들의 bestStage로 슬롯 배정
    for (const d of detections) {
      if (d.bestStage) stageToFiles[d.bestStage].push(d.fileIndex);
    }
    for (const stage of ALL_STAGES) {
      const candidates = stageToFiles[stage];
      if (candidates.length === 1) {
        assignment[stage] = candidates[0];
      } else if (candidates.length > 1) {
        // PRD F1.3: "마지막 업로드 우선 + 경고" — 마지막 인덱스를 채택
        assignment[stage] = candidates[candidates.length - 1];
      }
    }
  }

  const missing = ALL_STAGES.filter((s) => assignment[s] === undefined);
  const conflicts = ALL_STAGES
    .filter((s) => stageToFiles[s].length > 1)
    .map((stage) => ({ stage, fileIndices: stageToFiles[stage] }));

  return { assignment, missing, conflicts, combinedFileIndex };
}
