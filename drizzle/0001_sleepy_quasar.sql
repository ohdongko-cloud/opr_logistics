-- PRD #0001 §4.11 F11 — M7 이메일 OTP 로그인 (Gmail SMTP)
-- 멱등 IF NOT EXISTS 가드 (수동 재실행 안전)

CREATE TABLE IF NOT EXISTS "email_otps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '10 minutes' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_otps_email_idx" ON "email_otps" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_otps_expires_at_idx" ON "email_otps" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_email_idx" ON "sessions" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
