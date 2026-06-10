import Link from "next/link";

import { getRole } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

/** 인증 페이지 공통 헤더 — admin/master에게만 관리 링크 노출 */
export async function AppHeader() {
  const email = await getCurrentEmail();
  if (!email) return null;
  const role = await getRole(email);
  const isAdmin = role === "admin" || role === "master";
  return (
    <div className="no-print flex items-center justify-between border-b border-[var(--color-border)] pb-3 text-sm">
      <Link href="/" className="font-medium">
        OPR Logistics
      </Link>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-[var(--color-muted)]">{email}</span>
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded bg-slate-900 px-2.5 py-1 font-medium text-white"
          >
            관리
          </Link>
        )}
        <LogoutButton />
      </div>
    </div>
  );
}
