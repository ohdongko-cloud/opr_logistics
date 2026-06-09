import { defineConfig } from "drizzle-kit";

// 마이그레이션은 unpooled(Direct) URL 권장 — 트랜잭션/세션 일관성
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  // dev/lint 환경 위해 throw 대신 경고만.
  // 실제 migrate/generate 시 drizzle-kit이 에러를 던짐.
  console.warn("[drizzle.config] DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: url ?? "postgres://localhost/placeholder",
  },
  strict: true,
  verbose: true,
});
