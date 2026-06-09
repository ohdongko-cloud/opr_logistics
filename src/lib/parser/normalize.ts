/**
 * 헤더 시그니처 비교 등에 쓰는 문자열 정규화 (PRD §4.1 F1.2)
 * - NFKC: 전각/반각 통일, 합성문자 분해 정규화
 * - 공백·구두점·특수문자 제거 → 인코딩 깨짐(mojibake) 환경에서도 substring 매칭 가능
 */

/** 사람이 읽을 수 있도록 가벼운 정규화만 (다중 공백 1개로) */
export function normalize(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s).normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * 시그니처 비교용 정규화.
 * 공백·구두점·괄호·하이픈·점·콜론 제거 + 소문자.
 */
export function normalizeForSig(s: string | null | undefined): string {
  return normalize(s)
    .replace(/[\s.\-_/()[\],:;'"`?!@#$%^&*+=<>~|\\]/g, "")
    .toLowerCase();
}
