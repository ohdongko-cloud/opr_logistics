/**
 * 관리 페이지 (PRD #0003) — admin/master 전용. 비-admin은 / 리다이렉트.
 */
import { redirect } from "next/navigation";

import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { AppHeader } from "@/components/app-header";
import { getRole, masterEmail } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const email = await getCurrentEmail();
  if (!email) redirect("/login");
  const role = await getRole(email);
  if (role !== "admin" && role !== "master") redirect("/");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-8">
      <AppHeader />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">관리 페이지</h1>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          역할: {role === "master" ? "마스터 관리자" : "관리자"} ({email})
          {!masterEmail() && (
            <span className="ml-2 text-rose-600">
              ⚠ MASTER_ADMIN_EMAIL 미설정 — 마스터 기능 비활성
            </span>
          )}
        </p>
      </header>
      <AdminDashboard isMaster={role === "master"} />
    </main>
  );
}
