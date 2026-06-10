/**
 * PATCH /api/admin/users/[email] — 회원 수정 (PRD #0003 §10.4)
 *   - status 변경 → requireAdmin
 *   - role 변경(body.role 존재) → requireMaster (필드별 분리 검증)
 *   - env master 보호 / self-reduce 차단은 patchUser 내부
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin, requireMaster } from "@/lib/auth/guard";
import { patchUser } from "@/lib/auth/roles";

export const runtime = "nodejs";

const Body = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    status: z.enum(["active", "withdrawn"]).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ email: string }> }
) {
  // 최소 admin (status 변경)
  const g = await requireAdmin();
  if (!g.ok) return g.res;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  // role 변경이 포함되면 master 필수 (필드별 가드)
  if (parsed.data.role !== undefined) {
    const m = await requireMaster();
    if (!m.ok) return m.res;
  }
  if (parsed.data.role === undefined && parsed.data.status === undefined) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const { email } = await ctx.params;
  const res = await patchUser({
    targetEmail: decodeURIComponent(email),
    actorEmail: g.email,
    role: parsed.data.role,
    status: parsed.data.status,
  });
  if (!res.ok) {
    const status =
      res.error === "not_found" ? 404 : res.error === "self_reduce" ? 409 : 403;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    ok: true,
    user: {
      email: res.user.email,
      role: res.user.role,
      status: res.user.status,
    },
  });
}
