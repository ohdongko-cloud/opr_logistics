/**
 * 마이그레이션 실행 스크립트.
 *
 * 사용법 (로컬):
 *   1) `vercel link`로 프로젝트 연결
 *   2) `vercel env pull .env.local` 로 환경변수 받아옴
 *   3) `npm run db:migrate` 실행
 *
 * 또는 .env.local에 DATABASE_URL_UNPOOLED를 직접 입력 후 실행.
 *
 * NOTE: drizzle-kit의 기본 동작은 SQL 그대로 실행이라 이미 멱등(IF NOT EXISTS) 적용된
 *       마이그레이션이라 반복 실행해도 안전.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[migrate] DATABASE_URL_UNPOOLED 또는 DATABASE_URL 환경변수가 설정되지 않았습니다."
    );
    process.exit(1);
  }
  const sql = neon(url);
  const db = drizzle({ client: sql });
  console.log("[migrate] 시작…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] 완료 ✓");
}

main().catch((err) => {
  console.error("[migrate] 실패", err);
  process.exit(1);
});
