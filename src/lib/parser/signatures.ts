/**
 * RAW 4단계 헤더 시그니처 정의 (PRD §4.1 F1.2)
 * 헤더 컬럼 문자열들이 NFKC 정규화 후 모두 substring 매칭되어야 해당 단계로 인정.
 */

export type RawStage = "stage1" | "stage2" | "stage3" | "stage4";

export interface StageSignature {
  stage: RawStage;
  label: string;
  /** 헤더 어디엔가 모두 substring 매칭되어야 함 (정규화 후) */
  required: string[];
  /** 점수 가중치용 (선택) */
  optional?: string[];
}

export const STAGE_SIGNATURES: StageSignature[] = [
  {
    stage: "stage1",
    label: "1단계(STO)",
    required: ["구매 그룹", "Plnt", "합계", "오리지날 브랜드명", "자재"],
    optional: ["Sts", "Message", "스타일코드"],
  },
  {
    stage: "stage2",
    label: "2단계(물류분배)",
    required: ["분배번호", "분배 지정일", "점포명", "BOX수량", "납품가능수량"],
    optional: ["점포", "오더 수량"],
  },
  {
    stage: "stage3",
    label: "3단계(피킹지시서패션)",
    required: ["PG No.", "WO", "WT", "소스 빈", "자재그룹명", "피킹 수량"],
    optional: ["목적지 빈", "Sort Seq."],
  },
  {
    stage: "stage4",
    label: "4단계(EAN)",
    required: ["상품코드", "EAN코드", "입수수량", "자재 그룹", "효력 시작일"],
    optional: ["판매단위", "MD사번"],
  },
];

export const ALL_STAGES: RawStage[] = ["stage1", "stage2", "stage3", "stage4"];
