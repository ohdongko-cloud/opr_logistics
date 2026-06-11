-- PRD #0004 — 비밀번호 로그인. users에 비밀번호 컬럼 추가 (멱등·하위호환·NULL 기본).
-- 값: scrypt 인코딩 'scrypt$N$r$p$saltB64$hashB64'. NULL = 비밀번호 미설정(최초 로그인 시 OTP→설정).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_set_at" timestamp with time zone;
