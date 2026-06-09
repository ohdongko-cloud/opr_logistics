/**
 * 인증 미들웨어 (PRD §4.11 F11 / M7)
 *
 * 보호: /jobs/* 와 /api/jobs/* /api/upload
 * 공개: /login, /login/verify, /api/auth/*, /api/cron/* (자체 CRON_SECRET 검증)
 *
 * 인증 미통과 시:
 *   - 페이지 → 303 → /login
 *   - API → 401 JSON
 */
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/session";

const PROTECTED_PAGE_PREFIXES = ["/jobs"];
const PROTECTED_API_PREFIXES = ["/api/jobs", "/api/upload"];

function isProtected(pathname: string): { kind: "page" | "api" | null } {
  if (PROTECTED_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { kind: "page" };
  }
  if (PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return { kind: "api" };
  }
  return { kind: null };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const target = isProtected(pathname);
  if (target.kind === null) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySession(token);
  if (payload) return NextResponse.next();

  if (target.kind === "api") {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: { "cache-control": "no-store" },
      }
    );
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url, 303);
}

export const config = {
  matcher: [
    "/jobs/:path*",
    "/api/jobs/:path*",
    "/api/upload",
  ],
};
