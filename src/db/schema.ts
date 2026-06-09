/**
 * Drizzle ORM 스키마 (PRD #0001 §4.10 F10)
 *
 * 마이그레이션 원칙:
 *   - 멱등 (drizzle generate가 IF NOT EXISTS / IF EXISTS 사용)
 *   - 신규 컬럼은 default 부여 (하위호환)
 *   - 파괴적 변경은 사용자 확인
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ============================================================================
// plants — 점포(플랜트) 매핑 (부록 E)
// ============================================================================
export const plants = pgTable("plants", {
  plnt: text("plnt").primaryKey(), // SAP 플랜트 코드 (예: '8227')
  outletName: text("outlet_name").notNull(), // 출고지명 (예: '강서')
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// jobs — 업로드/처리 잡 (7일 TTL)
// ============================================================================
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plnt: text("plnt")
      .notNull()
      .references(() => plants.plnt),

    // 'uploaded' | 'parsed' | 'pg_pending' | 'ready' | 'archived'
    status: text("status").notNull().default("uploaded"),

    sourceFilenames: text("source_filenames")
      .array()
      .notNull()
      .default(sql`'{}'`),

    blobKeys: text("blob_keys")
      .array()
      .notNull()
      .default(sql`'{}'`),

    // { "8227": "1000191008" }
    pgNumbers: jsonb("pg_numbers")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    // { docTitle: "...", deliveryDate: "...", footerLeft: "..." }
    headerOverrides: jsonb("header_overrides")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),

    // M6 후 이메일 OTP 도입 시 채움
    createdByEmail: text("created_by_email"),
  },
  (t) => [index("jobs_expires_at_idx").on(t.expiresAt)]
);

// ============================================================================
// cleanup_log — 7일 TTL cron 실행 결과 (30일 TTL)
// ============================================================================
export const cleanupLog = pgTable("cleanup_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  deletedRows: integer("deleted_rows").notNull(),
  deletedBlobs: integer("deleted_blobs").notNull(),
  errors: jsonb("errors").$type<unknown[]>().notNull().default([]),
});

// ============================================================================
// Types
// ============================================================================
export type Plant = typeof plants.$inferSelect;
export type NewPlant = typeof plants.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export type CleanupLog = typeof cleanupLog.$inferSelect;
export type NewCleanupLog = typeof cleanupLog.$inferInsert;
