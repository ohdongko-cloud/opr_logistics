/**
 * RAW 시트 헤더 → 컬럼 인덱스 매핑 (정규화 안전)
 *
 * 컬럼 위치를 하드코딩하지 않고 헤더 텍스트로 찾는다 (PRD §4.1 F1.2의 자동 판별 정신을 데이터 단계에도 적용).
 * 이렇게 하면 컬럼 순서가 약간 바뀌어도 동작한다.
 */
import { normalizeForSig } from "@/lib/parser/normalize";

/** 헤더 배열에서 정규화 기반으로 컬럼 인덱스를 찾는다. */
export function findColumn(
  headers: ReadonlyArray<string>,
  ...candidates: string[]
): number {
  const normalizedHeaders = headers.map(normalizeForSig);
  for (const c of candidates) {
    const target = normalizeForSig(c);
    const i = normalizedHeaders.indexOf(target);
    if (i >= 0) return i;
  }
  return -1;
}

/** 헤더 배열에서 substring 매칭으로 컬럼 인덱스를 찾는다. */
export function findColumnContains(
  headers: ReadonlyArray<string>,
  ...candidates: string[]
): number {
  const normalizedHeaders = headers.map(normalizeForSig);
  for (const c of candidates) {
    const target = normalizeForSig(c);
    const i = normalizedHeaders.findIndex((h) => h.includes(target));
    if (i >= 0) return i;
  }
  return -1;
}

// ============================================================================
// 단계별 컬럼 셋
// ============================================================================

export interface Stage1Cols {
  purchaseGroup: number; // C 구매 그룹
  delivery: number; // G 납품 (번호)
  plnt: number; // I Plnt
  origBrand: number; // P 오리지날 브랜드 (코드)
  origBrandName: number; // Q 오리지날 브랜드명
  material: number; // S 자재
  mcGroup: number; // T MC(자재그룹)
  totalQty: number; // Y 합계
}

export function resolveStage1(headers: ReadonlyArray<string>): Stage1Cols {
  return {
    purchaseGroup: findColumn(headers, "구매 그룹", "구매그룹"),
    delivery: findColumnContains(headers, "납품"),
    plnt: findColumn(headers, "Plnt", "플랜트", "Plant"),
    origBrand: findColumn(headers, "오리지날 브랜드"),
    origBrandName: findColumn(headers, "오리지날 브랜드명"),
    material: findColumn(headers, "자재"),
    mcGroup: findColumnContains(headers, "MC(자재그룹)", "자재그룹"),
    totalQty: findColumn(headers, "합계"),
  };
}

export interface Stage3Cols {
  material: number; // E 자재코드
  pickQty: number; // G 피킹 수량
  sourceBin: number; // K 소스 빈
  matGroup: number; // R 자재그룹
  matGroupName: number; // S 자재그룹명
}

export function resolveStage3(headers: ReadonlyArray<string>): Stage3Cols {
  return {
    material: findColumn(headers, "자재코드", "자재 코드"),
    pickQty: findColumn(headers, "피킹 수량", "피킹수량"),
    sourceBin: findColumn(headers, "소스 빈", "소스빈"),
    matGroup: findColumn(headers, "자재그룹"),
    matGroupName: findColumn(headers, "자재그룹명"),
  };
}

export interface Stage4Cols {
  productCode: number; // A 상품코드
  eanCode: number; // B EAN코드
  effectiveStart: number; // U 효력 시작일
}

export function resolveStage4(headers: ReadonlyArray<string>): Stage4Cols {
  return {
    productCode: findColumn(headers, "상품코드", "상품 코드"),
    eanCode: findColumn(headers, "EAN코드", "EAN 코드"),
    effectiveStart: findColumn(headers, "효력 시작일", "효력시작일"),
  };
}

/** 누락된 필수 컬럼을 reason 리스트로 반환 (검증용) */
export function missingColumns(
  cols: Record<string, number>,
  required: ReadonlyArray<string>
): string[] {
  return required.filter((k) => (cols[k] ?? -1) < 0);
}
