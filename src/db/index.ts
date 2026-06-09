/**
 * Neon + Drizzle 클라이언트 (런타임)
 * - Edge / Node 모두 호환되도록 @neondatabase/serverless 사용.
 * - 풀링 URL이 있으면 우선 사용. 없으면 단일 URL.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "[db] DATABASE_URL 또는 DATABASE_URL_UNPOOLED 환경변수가 설정되지 않았습니다."
  );
}

const sqlClient = neon(url);

export const db = drizzle({ client: sqlClient, schema });

export { schema };
