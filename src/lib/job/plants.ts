/**
 * plant → outlet 매핑 — DB가 연결되지 않은 환경에서는 정적 폴백.
 * M5에서 Neon plants 테이블 lookup으로 교체.
 */

const STATIC_FALLBACK: Record<string, string> = {
  "8227": "강서",
};

let warned = false;
async function tryDbResolver(plnt: string): Promise<string | null> {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    return null;
  }
  try {
    const { db, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select({ name: schema.plants.outletName })
      .from(schema.plants)
      .where(eq(schema.plants.plnt, plnt))
      .limit(1);
    return rows[0]?.name ?? null;
  } catch (e) {
    if (!warned) {
      console.warn("[plants] DB lookup failed, falling back to static map:", e);
      warned = true;
    }
    return null;
  }
}

/** 비동기 lookup이 필요한 경우는 직접 호출. 동기 폴백은 staticOutletResolver. */
export async function outletResolverAsync(plnt: string): Promise<string | null> {
  const fromDb = await tryDbResolver(plnt);
  if (fromDb !== null) return fromDb;
  return STATIC_FALLBACK[plnt] ?? null;
}

/** 동기 폴백 — 정적 매핑만 (개발/M4용) */
export function staticOutletResolver(plnt: string): string | null {
  return STATIC_FALLBACK[plnt] ?? null;
}
