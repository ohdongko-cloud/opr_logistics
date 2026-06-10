/**
 * 마이그레이션 실행 — drizzle/*.sql 파일을 정렬 순서대로 직접 실행.
 *
 * drizzle-orm migrate()는 drizzle/meta/_journal.json 에 의존하는데, 이 파일이
 * 환경/clone 상태에 따라 없을 수 있어 신뢰성이 떨어진다. 우리 SQL은 전부
 * IF NOT EXISTS 멱등이므로, 파일을 직접 순서대로 실행하는 게 가장 견고하다.
 *
 * 사용법:
 *   1) .env.local 에 DATABASE_URL_UNPOOLED (또는 DATABASE_URL) 설정
 *   2) npm run db:migrate
 *   여러 번 실행해도 안전 (멱등).
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as dsql } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "[migrate] DATABASE_URL_UNPOOLED 또는 DATABASE_URL 환경변수가 설정되지 않았습니다."
    );
    process.exit(1);
  }
  const db = drizzle({ client: neon(url) });

  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0000_, 0001_, ... 사전순 = 적용 순서

  if (files.length === 0) {
    console.error("[migrate] drizzle/*.sql 파일이 없습니다.");
    process.exit(1);
  }

  console.log(`[migrate] ${files.length}개 마이그레이션 파일 발견:`, files);

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf8");
    // drizzle은 statement를 '--> statement-breakpoint' 로 구분
    const statements = raw
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^(--.*)?$/.test(s));

    console.log(`[migrate] ${file} — ${statements.length}개 statement 실행`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]!;
      try {
        await db.execute(dsql.raw(stmt));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // 이미 존재(멱등 재실행)는 무시, 그 외는 표시
        if (/already exists/i.test(msg)) {
          console.log(`  [skip] statement ${i + 1}: 이미 존재`);
        } else {
          console.error(`  [error] statement ${i + 1}:`, msg);
          console.error("  SQL:", stmt.slice(0, 200));
          throw err;
        }
      }
    }
  }
  console.log("[migrate] 완료 ✓");
}

main().catch((err) => {
  console.error("[migrate] 실패", err);
  process.exit(1);
});
