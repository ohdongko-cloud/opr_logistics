-- PRD #0002 §4.1 — 단계 상태머신 step 컬럼 (멱등·하위호환)
-- 기존 잡은 default 's1_uploaded'. status는 잔존(하위호환).
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "step" text DEFAULT 's1_uploaded' NOT NULL;
