import { describe, expect, it } from "vitest";
import {
  canTransition,
  invalidationFor,
  stepToScreen,
} from "./transitions";

describe("canTransition (상태머신 매트릭스)", () => {
  it("create → s1_uploaded 합법", () => {
    expect(canTransition(null, "s1_uploaded")).toBe(true);
  });
  it("s1 → s2 또는 pg 직행 둘 다 합법 (STEP2 선택)", () => {
    expect(canTransition("s1_uploaded", "s2_uploaded")).toBe(true);
    expect(canTransition("s1_uploaded", "pg_entered")).toBe(true);
  });
  it("s2 → pg 합법", () => {
    expect(canTransition("s2_uploaded", "pg_entered")).toBe(true);
  });
  it("정상 시퀀스 pg→s3→s4→ready", () => {
    expect(canTransition("pg_entered", "s3_uploaded")).toBe(true);
    expect(canTransition("s3_uploaded", "s4_uploaded")).toBe(true);
    expect(canTransition("s4_uploaded", "ready")).toBe(true);
  });
  it("비순차 전이 거부", () => {
    expect(canTransition(null, "pg_entered")).toBe(false); // created→PG
    expect(canTransition("s1_uploaded", "s3_uploaded")).toBe(false); // pg 없이 s3
    expect(canTransition("pg_entered", "ready")).toBe(false); // 출력2 없이 ready
    expect(canTransition("s1_uploaded", "ready")).toBe(false);
    expect(canTransition("ready", "s1_uploaded")).toBe(false); // 종착에서 직접 전이 없음
  });
});

describe("invalidationFor (무효화 전이표)", () => {
  it("STEP1 재업로드 → s1로 강등 + 전부 폐기", () => {
    const r = invalidationFor(1);
    expect(r.demoteTo).toBe("s1_uploaded");
    expect(r.discard).toContain("pgNumbers");
    expect(r.discard).toContain("outputs23");
    expect(r.discard).toContain("stage3");
    expect(r.discard).toContain("stage4");
  });
  it("STEP5(3단계) 재업로드 → s3로 강등 + 출력23/stage4 폐기", () => {
    const r = invalidationFor(3);
    expect(r.demoteTo).toBe("s3_uploaded");
    expect(r.discard).toEqual(["outputs23", "stage4"]);
  });
  it("STEP6(4단계) 재업로드 → s4로 강등 + 출력23 폐기", () => {
    const r = invalidationFor(4);
    expect(r.demoteTo).toBe("s4_uploaded");
    expect(r.discard).toEqual(["outputs23"]);
  });
});

describe("stepToScreen", () => {
  it("step → 화면 번호", () => {
    expect(stepToScreen(null)).toBe(2);
    expect(stepToScreen("s1_uploaded")).toBe(2);
    expect(stepToScreen("s2_uploaded")).toBe(3);
    expect(stepToScreen("pg_entered")).toBe(4);
    expect(stepToScreen("s3_uploaded")).toBe(6);
    expect(stepToScreen("s4_uploaded")).toBe(7);
    expect(stepToScreen("ready")).toBe(8);
  });
});
