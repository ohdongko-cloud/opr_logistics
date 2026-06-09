/**
 * Neon + Drizzle 클라이언트 (런타임, lazy)
 *
 * - import 시점에 connection을 만들지 않음 (DATABASE_URL 없는 환경에서도 안전)
 * - 첫 쿼리 호출 시 만들고 캐시
 */
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

let cached: DB | null = null;

function getDb(): DB {
  if (cached) return cached;
  // 런타임은 pooled (DATABASE_URL) 우선. 폴백으로 unpooled 허용.
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    throw new Error(
      "[db] DATABASE_URL 또는 DATABASE_URL_UNPOOLED 환경변수가 설정되지 않았습니다."
    );
  }
  const sqlClient = neon(url);
  cached = drizzle({ client: sqlClient, schema });
  return cached;
}

/**
 * 사용 시점에만 실제 connection 생성. 환경변수가 없는 환경(테스트 등)에서도
 * 단순히 `import { db } from "@/db"` 하는 것만으로 throw하지 않음.
 */
export const db = new Proxy({} as DB, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
