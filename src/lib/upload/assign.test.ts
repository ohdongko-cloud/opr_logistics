import { describe, expect, it } from "vitest";
import { assignSlots, type FileDetection } from "./assign";

function det(
  fileIndex: number,
  filename: string,
  best: { stage: "stage1" | "stage2" | "stage3" | "stage4" | null; conf?: number },
  candidates: Array<{ stage: "stage1" | "stage2" | "stage3" | "stage4"; conf?: number }> = []
): FileDetection {
  return {
    fileIndex,
    filename,
    bestStage: best.stage,
    bestConfidence: best.conf ?? (best.stage ? 1 : 0),
    stageCandidates:
      candidates.length > 0
        ? candidates.map((c) => ({
            stage: c.stage,
            confidence: c.conf ?? 1,
            sheetName: c.stage,
          }))
        : best.stage
          ? [{ stage: best.stage, confidence: best.conf ?? 1, sheetName: best.stage }]
          : [],
  };
}

describe("assignSlots", () => {
  it("assigns each file to its detected stage", () => {
    const r = assignSlots([
      det(0, "a.xlsx", { stage: "stage1" }),
      det(1, "b.xlsx", { stage: "stage2" }),
      det(2, "c.xlsx", { stage: "stage3" }),
      det(3, "d.xlsx", { stage: "stage4" }),
    ]);
    expect(r.assignment).toEqual({
      stage1: 0,
      stage2: 1,
      stage3: 2,
      stage4: 3,
    });
    expect(r.missing).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.combinedFileIndex).toBeNull();
  });

  it("detects combined workbook with all 4 stages", () => {
    const r = assignSlots([
      det(0, "all.xlsx", { stage: "stage1" }, [
        { stage: "stage1" },
        { stage: "stage2" },
        { stage: "stage3" },
        { stage: "stage4" },
      ]),
    ]);
    expect(r.combinedFileIndex).toBe(0);
    expect(r.assignment).toEqual({
      stage1: 0,
      stage2: 0,
      stage3: 0,
      stage4: 0,
    });
    expect(r.missing).toEqual([]);
  });

  it("reports missing slots", () => {
    const r = assignSlots([
      det(0, "a.xlsx", { stage: "stage1" }),
      det(1, "b.xlsx", { stage: null }),
    ]);
    expect(r.assignment).toEqual({ stage1: 0 });
    expect(r.missing).toEqual(["stage2", "stage3", "stage4"]);
  });

  it("reports conflicts and keeps last-uploaded file (F1.3)", () => {
    const r = assignSlots([
      det(0, "a.xlsx", { stage: "stage1" }),
      det(1, "b.xlsx", { stage: "stage1" }), // 같은 단계 두 번째
    ]);
    expect(r.assignment.stage1).toBe(1);
    expect(r.conflicts.length).toBe(1);
    expect(r.conflicts[0]).toEqual({ stage: "stage1", fileIndices: [0, 1] });
  });
});
