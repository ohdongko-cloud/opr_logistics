import { describe, expect, it } from "vitest";
import { detectStage } from "./detect";

describe("detectStage (PRD §4.1 F1.2)", () => {
  it("detects 1단계 (STO) from sample headers", () => {
    const headers = [
      "Sts",
      "Message",
      "구매 그룹",
      "구매그룹 내역",
      "구매 문서",
      "품목",
      "납품",
      "품목",
      "Plnt",
      "저장 위치",
      "물류센터",
      "물류센터 저장위치",
      "분배번호",
      "분배차수",
      "분배 지정일",
      "오리지날 브랜드",
      "오리지날 브랜드명",
      "스타일코드",
      "자재",
      "MC(자재그룹)",
      "물류재고",
      "출고진행수량",
      "미완료납품수량",
      "STO가능수량",
      "합계",
    ];
    const r = detectStage(headers);
    expect(r.stage).toBe("stage1");
    expect(r.confidence).toBe(1);
  });

  it("detects 2단계 (물류분배)", () => {
    const headers = [
      "Sts",
      "분배번호",
      "분배 지정일",
      "구매 문서",
      "품목",
      "구매 그룹",
      "구매그룹 내역",
      "상품",
      "상품명",
      "증빙일",
      "납품일",
      "점포",
      "점포명",
      "오더 수량",
      "BOX수량",
      "오더 단위",
      "물류재고",
      "출고진행수량",
      "미완료납품수량",
      "납품가능수량",
    ];
    const r = detectStage(headers);
    expect(r.stage).toBe("stage2");
  });

  it("detects 3단계 (피킹지시서패션)", () => {
    const headers = [
      "PG No.",
      "WO",
      "WT",
      "상태",
      "자재코드",
      "내역",
      "피킹 수량",
      "확정 수량",
      "단위",
      "소스 저장유형",
      "소스 빈",
      "목적지 저장유형",
      "목적지 빈",
      "랙",
      "열",
      "단",
      "Sort Seq.",
      "자재그룹",
      "자재그룹명",
    ];
    const r = detectStage(headers);
    expect(r.stage).toBe("stage3");
  });

  it("detects 4단계 (EAN)", () => {
    const headers = [
      "상품코드",
      "EAN코드",
      "상품명",
      "판매단위",
      "입수수량",
      "구매 그룹",
      "구매그룹 내역",
      "자재 그룹",
      "자재 그룹 내역",
      "저장 조건",
      "내역",
      "브랜드",
      "오리지날브랜드",
      "자재범주",
      "자재범주 내역",
      "자재상태(기본뷰)",
      "자재상태(DC뷰)",
      "MD사번",
      "MD사번 내역",
      "사입형태",
      "효력 시작일",
    ];
    const r = detectStage(headers);
    expect(r.stage).toBe("stage4");
  });

  it("returns null for ambiguous/empty headers", () => {
    expect(detectStage(["alpha", "beta", "gamma"]).stage).toBeNull();
    expect(detectStage([]).stage).toBeNull();
  });

  it("survives encoding artifacts (NFKC normalize + special chars stripped)", () => {
    // 시그니처에 모지바케/전각 문자가 섞여도 NFKC + 특수문자 제거로 매칭.
    const headers = [
      "ＰＧ Ｎｏ．",
      "ＷＯ",
      "ＷＴ",
      "소스　빈",
      "자재그룹명",
      "피킹 수량",
    ];
    const r = detectStage(headers);
    expect(r.stage).toBe("stage3");
  });
});
