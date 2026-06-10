/**
 * 관리 라우트 가드 (PRD #0003 §10.3) — 모든 /api/admin/* 핸들러 첫 줄에서 호출.
 */
import { NextResponse } from "next/server";

import { getRole } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";

export type GuardOk = { ok: true; email: string; role: "admin" | "master" };
export type GuardFail = { ok: false; res: NextResponse };

/** admin 또는 master 요구. 실패 시 res(401/403) 동봉. */
export async function requireAdmin(): Promise<GuardOk | GuardFail> {
  const email = await getCurrentEmail();
  if (!email) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const role = await getRole(email);
  if (role !== "admin" && role !== "master") {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, email, role };
}

/** master 전용. */
export async function requireMaster(): Promise<GuardOk | GuardFail> {
  const email = await getCurrentEmail();
  if (!email) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const role = await getRole(email);
  if (role !== "master") {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, email, role };
}
