/** GET /api/admin/login-logs — 접속 로그 (PRD #0003 §5.6). requireAdmin. */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guard";
import { listLoginLogs } from "@/lib/auth/roles";

export const runtime = "nodejs";

export async function GET() {
  const g = await requireAdmin();
  if (!g.ok) return g.res;
  const logs = await listLoginLogs(200);
  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      email: l.email,
      ip: l.ip,
      userAgent: l.userAgent,
      success: l.success,
      reason: l.reason,
      at: l.at instanceof Date ? l.at.toISOString() : String(l.at),
    })),
  });
}
