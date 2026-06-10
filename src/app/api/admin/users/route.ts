/**
 * GET  /api/admin/users — 회원 목록 (requireAdmin)
 * POST /api/admin/users — 회원 추가 (requireAdmin)
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guard";
import { addUser, listUsers } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const users = await listUsers();
  return NextResponse.json({
    masterEmail: process.env.MASTER_ADMIN_EMAIL ?? null,
    users: users.map((u) => ({
      email: u.email,
      role: u.role,
      status: u.status,
      invitedBy: u.invitedBy,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    })),
  });
}

const PostBody = z.object({ email: z.string().email().max(200) }).strict();

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const r = await addUser(parsed.data.email, g.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
