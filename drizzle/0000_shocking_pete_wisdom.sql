-- PRD #0001 §4.10 F10 — 멱등(IF NOT EXISTS)·하위호환·기본값 적용
-- Drizzle journal이 한 번 적용된 마이그레이션을 다시 실행하지 않지만,
-- 수동 재실행/롤아웃 안전성을 위해 IF NOT EXISTS 가드를 명시.

CREATE TABLE IF NOT EXISTS "plants" (
	"plnt" text PRIMARY KEY NOT NULL,
	"outlet_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plnt" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"source_filenames" text[] DEFAULT '{}' NOT NULL,
	"blob_keys" text[] DEFAULT '{}' NOT NULL,
	"pg_numbers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"header_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"created_by_email" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cleanup_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_rows" integer NOT NULL,
	"deleted_blobs" integer NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_plnt_plants_plnt_fk'
  ) THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_plnt_plants_plnt_fk"
      FOREIGN KEY ("plnt") REFERENCES "public"."plants"("plnt")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_expires_at_idx" ON "jobs" USING btree ("expires_at");
--> statement-breakpoint
-- 초기 시드 (강서점) — 멱등 upsert
INSERT INTO "plants" ("plnt", "outlet_name", "is_active")
VALUES ('8227', '강서', true)
ON CONFLICT ("plnt") DO NOTHING;
