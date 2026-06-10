/**
 * RBAC 역할 + 멤버십 게이트 (PRD #0003 §10)
 *
 * 평가 순서 강제:
 *  - env master는 DB보다 우선(강등 불가). MASTER_ADMIN_EMAIL 미설정 → 누구도 master 아님.
 *  - email은 항상 normalizeEmail(소문자+trim)로 저장·조회 (PK 정규화 불변식).
 *
 * USE_DB=false(인메모리/테스트)면 users/login_logs는 메모리 폴백.
 */
import { and, eq, sql as dsql } from "drizzle-orm";

import { db } from "@/db";
import { loginLogs, users } from "@/db/schema";
import { isEmailAllowed, normalizeEmail } from "./allowlist";

const USE_DB = !!(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED);

export type Role = "master" | "admin" | "user";
export type UserStatus = "active" | "withdrawn";
export type LoginReason =
  | "success"
  | "wrong_code"
  | "expired"
  | "too_many_attempts"
  | "not_allowed"
  | "withdrawn";

/** env master 이메일 (정규화). 미설정이면 null. */
export function masterEmail(): string | null {
  const raw = process.env.MASTER_ADMIN_EMAIL;
  if (!raw || raw.trim().length === 0) return null;
  return normalizeEmail(raw);
}

export function isMasterEmail(email: string): boolean {
  const m = masterEmail();
  if (!m) return false;
  return normalizeEmail(email) === m;
}

// ============================================================================
// 인메모리 폴백 (테스트/DB 미설정)
// ============================================================================
interface MemUser {
  email: string;
  role: Role;
  status: UserStatus;
  invitedBy: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}
const UKEY = Symbol.for("opr-logistics.users.v1");
const LKEY = Symbol.for("opr-logistics.loginlogs.v1");
type G = typeof globalThis & {
  [k: symbol]: Map<string, MemUser> | unknown[] | undefined;
};
const g = globalThis as G;
const memUsers = (g[UKEY] as Map<string, MemUser>) ?? new Map<string, MemUser>();
if (!g[UKEY]) g[UKEY] = memUsers;
interface MemLog {
  id: number;
  email: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  reason: string | null;
  at: Date;
}
const memLogs = (g[LKEY] as MemLog[]) ?? [];
if (!g[LKEY]) g[LKEY] = memLogs;

// ============================================================================
// 조회
// ============================================================================
export interface UserRecord {
  email: string;
  role: Role;
  status: UserStatus;
  invitedBy: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}

async function findUser(email: string): Promise<UserRecord | null> {
  const key = normalizeEmail(email);
  if (!USE_DB) {
    const u = memUsers.get(key);
    return u ? { ...u } : null;
  }
  const rows = await db.select().from(users).where(eq(users.email, key)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    email: r.email,
    role: (r.role as Role) ?? "user",
    status: (r.status as UserStatus) ?? "active",
    invitedBy: r.invitedBy,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
  };
}

/** 역할 — env master 최우선(DB 무관). */
export async function getRole(email: string): Promise<Role> {
  if (isMasterEmail(email)) return "master";
  const u = await findUser(email);
  return u?.role ?? "user";
}

export async function requireRole(
  email: string | null,
  min: "admin" | "master"
): Promise<boolean> {
  if (!email) return false;
  const role = await getRole(email);
  if (min === "master") return role === "master";
  return role === "admin" || role === "master";
}

// ============================================================================
// 멤버십 / 로그인 게이트
// ============================================================================
async function upsertUser(rec: {
  email: string;
  role?: Role;
  status?: UserStatus;
  invitedBy?: string | null;
}): Promise<void> {
  const key = normalizeEmail(rec.email);
  if (!USE_DB) {
    const existing = memUsers.get(key);
    memUsers.set(key, {
      email: key,
      role: rec.role ?? existing?.role ?? "user",
      status: rec.status ?? existing?.status ?? "active",
      invitedBy: rec.invitedBy ?? existing?.invitedBy ?? null,
      createdAt: existing?.createdAt ?? new Date(),
      lastLoginAt: existing?.lastLoginAt ?? null,
    });
    return;
  }
  await db
    .insert(users)
    .values({
      email: key,
      role: rec.role ?? "user",
      status: rec.status ?? "active",
      invitedBy: rec.invitedBy ?? null,
    })
    .onConflictDoNothing({ target: users.email });
}

/**
 * 로그인 허용 여부 + 사유 — **읽기 전용**(프로비저닝 안 함). (PRD §10.1 순서)
 * send-otp 게이트 및 verify-otp 성공 전 게이트에 사용.
 * 미검증 이메일이 OTP 요청만으로 회원 row를 만들지 못하게 한다.
 */
export async function checkLoginAllowed(
  email: string
): Promise<{ ok: boolean; reason: LoginReason }> {
  const key = normalizeEmail(email);
  // 1. env master 최우선 (withdrawn 무시)
  if (isMasterEmail(key)) return { ok: true, reason: "success" };
  const u = await findUser(key);
  if (u) {
    if (u.status === "withdrawn") return { ok: false, reason: "withdrawn" };
    return { ok: true, reason: "success" };
  }
  // row 없음 → env 허용자만 (프로비저닝은 verify 성공 시)
  if (isEmailAllowed(key)) return { ok: true, reason: "success" };
  return { ok: false, reason: "not_allowed" };
}

/**
 * verify-otp **성공 시** 회원 프로비저닝 (소유권 증명 후에만).
 * env master → master row 보장, env 허용 신규자 → user row 생성.
 */
export async function provisionLogin(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (isMasterEmail(key)) {
    await upsertUser({ email: key, role: "master", status: "active" });
    return;
  }
  const u = await findUser(key);
  if (u) return; // 이미 존재
  if (isEmailAllowed(key)) {
    await upsertUser({ email: key, role: "user", status: "active" });
  }
}

/** verify-otp 성공 시 last_login_at 갱신 */
export async function touchLastLogin(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if (!USE_DB) {
    const u = memUsers.get(key);
    if (u) u.lastLoginAt = new Date();
    return;
  }
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.email, key));
}

// ============================================================================
// 접속 로그
// ============================================================================
export async function recordLogin(input: {
  email: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  reason: LoginReason;
}): Promise<void> {
  const ua = input.userAgent ? input.userAgent.slice(0, 200) : null;
  if (!USE_DB) {
    memLogs.unshift({
      id: memLogs.length + 1,
      email: normalizeEmail(input.email),
      ip: input.ip,
      userAgent: ua,
      success: input.success,
      reason: input.reason,
      at: new Date(),
    });
    return;
  }
  await db.insert(loginLogs).values({
    email: normalizeEmail(input.email),
    ip: input.ip,
    userAgent: ua,
    success: input.success,
    reason: input.reason,
  });
}

// ============================================================================
// 관리 — 회원 목록/추가/수정 (PRD §10.3·10.4)
// ============================================================================
export async function listUsers(): Promise<UserRecord[]> {
  if (!USE_DB) {
    return Array.from(memUsers.values()).map((u) => ({ ...u }));
  }
  const rows = await db.select().from(users).orderBy(users.createdAt);
  return rows.map((r) => ({
    email: r.email,
    role: (r.role as Role) ?? "user",
    status: (r.status as UserStatus) ?? "active",
    invitedBy: r.invitedBy,
    createdAt: r.createdAt,
    lastLoginAt: r.lastLoginAt,
  }));
}

export async function addUser(
  email: string,
  invitedBy: string
): Promise<{ ok: boolean; error?: string }> {
  const key = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) {
    return { ok: false, error: "invalid_email" };
  }
  await upsertUser({ email: key, role: "user", status: "active", invitedBy });
  return { ok: true };
}

export type PatchUserResult =
  | { ok: true; user: UserRecord }
  | { ok: false; error: "not_found" | "forbidden" | "self_reduce" };

/**
 * 회원 수정 — 필드별 가드는 라우트에서(role→master, status→admin).
 * env master 보호 / self-reduce 차단은 여기서 강제.
 */
export async function patchUser(input: {
  targetEmail: string;
  actorEmail: string;
  role?: Role;
  status?: UserStatus;
}): Promise<PatchUserResult> {
  const target = normalizeEmail(input.targetEmail);
  const actor = normalizeEmail(input.actorEmail);

  // env master 보호 — 누구도(자신 포함) 강등/탈퇴 불가
  if (isMasterEmail(target)) {
    return { ok: false, error: "forbidden" };
  }
  // self-reduce 차단 (자기 탈퇴/강등)
  if (
    target === actor &&
    ((input.status === "withdrawn") || (input.role && input.role !== "admin"))
  ) {
    return { ok: false, error: "self_reduce" };
  }

  const existing = await findUser(target);
  if (!existing && !USE_DB) {
    // 인메모리에서 대상 없으면 not_found
    return { ok: false, error: "not_found" };
  }

  // PRD §5.5 — admin은 user만 관리. 대상이 admin이면 master만 수정 가능.
  if (existing?.role === "admin") {
    const actorRole = await getRole(actor);
    if (actorRole !== "master") {
      return { ok: false, error: "forbidden" };
    }
  }

  if (!USE_DB) {
    const u = memUsers.get(target)!;
    if (input.role) u.role = input.role;
    if (input.status) u.status = input.status;
    return { ok: true, user: { ...u } };
  }

  const set: Record<string, unknown> = {};
  if (input.role) set.role = input.role;
  if (input.status) set.status = input.status;
  if (Object.keys(set).length === 0) {
    const u = await findUser(target);
    if (!u) return { ok: false, error: "not_found" };
    return { ok: true, user: u };
  }
  const updated = await db
    .update(users)
    .set(set)
    .where(and(eq(users.email, target), dsql`true`))
    .returning();
  if (updated.length === 0) return { ok: false, error: "not_found" };
  const r = updated[0]!;
  return {
    ok: true,
    user: {
      email: r.email,
      role: (r.role as Role) ?? "user",
      status: (r.status as UserStatus) ?? "active",
      invitedBy: r.invitedBy,
      createdAt: r.createdAt,
      lastLoginAt: r.lastLoginAt,
    },
  };
}

/** 테스트용 */
export function clearRolesStore(): void {
  memUsers.clear();
  memLogs.length = 0;
}
export async function listLoginLogs(limit = 200): Promise<MemLog[]> {
  if (!USE_DB) return memLogs.slice(0, limit);
  const rows = await db
    .select()
    .from(loginLogs)
    .orderBy(dsql`${loginLogs.at} DESC`)
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    ip: r.ip,
    userAgent: r.userAgent,
    success: r.success,
    reason: r.reason,
    at: r.at,
  }));
}
