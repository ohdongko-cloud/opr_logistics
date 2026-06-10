"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Tab = "jobs" | "users" | "logs";

export function AdminDashboard({ isMaster }: { isMaster: boolean }) {
  const [tab, setTab] = useState<Tab>("jobs");
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-2 border-b border-[var(--color-border)]">
        {(
          [
            ["jobs", "작업 이력"],
            ["users", "회원 관리"],
            ["logs", "접속 로그"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "border-b-2 border-slate-900 px-3 py-2 text-sm font-medium"
                : "px-3 py-2 text-sm text-[var(--color-muted)]"
            }
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "jobs" && <JobsPanel />}
      {tab === "users" && <UsersPanel isMaster={isMaster} />}
      {tab === "logs" && <LogsPanel />}
    </div>
  );
}

// ============================================================================
// 작업 이력 + 다운로드
// ============================================================================
interface JobRow {
  id: string;
  plnt: string;
  step: string;
  createdByEmail: string | null;
  sourceFilenames: string[];
  createdAt: string;
  expiresAt: string;
  downloadable: boolean;
}

function remaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "만료됨";
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  return `${d}일 ${h % 24}시간`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const STEP_LABEL: Record<string, string> = {
  s1_uploaded: "1단계",
  s2_uploaded: "2단계",
  pg_entered: "PG입력",
  s3_uploaded: "3단계",
  s4_uploaded: "4단계",
  ready: "완료",
};

function JobsPanel() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs ?? []))
      .catch(() => toast.error("작업 이력 로드 실패"));
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        ⚠ 업로드된 작업 파일은 <strong>7일 후 자동 삭제</strong>됩니다. 필요한 파일은 미리
        다운로드하세요.
      </div>
      {jobs === null ? (
        <p className="text-sm text-[var(--color-muted)]">로딩 중…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">작업 이력이 없습니다.</p>
      ) : (
        <div className="overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-left">
              <tr>
                {["일자/시간", "사용자", "플랜트", "단계", "파일", "보관기간", "다운로드"].map(
                  (h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-[var(--color-border)]">
                  <td className="px-2 py-1.5">{fmt(j.createdAt)}</td>
                  <td className="px-2 py-1.5">{j.createdByEmail ?? "—"}</td>
                  <td className="px-2 py-1.5">{j.plnt}</td>
                  <td className="px-2 py-1.5">{STEP_LABEL[j.step] ?? j.step}</td>
                  <td className="px-2 py-1.5 max-w-[180px] truncate" title={j.sourceFilenames.join(", ")}>
                    {j.sourceFilenames.join(", ") || "—"}
                  </td>
                  <td className="px-2 py-1.5">{remaining(j.expiresAt)}</td>
                  <td className="px-2 py-1.5">
                    {j.downloadable ? (
                      <a
                        href={`/api/admin/jobs/${j.id}/download`}
                        className="rounded bg-slate-900 px-2 py-1 text-white"
                      >
                        다운로드
                      </a>
                    ) : (
                      <span className="text-[var(--color-muted)]">미완료</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 회원 관리
// ============================================================================
interface UserRow {
  email: string;
  role: string;
  status: string;
  invitedBy: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

function UsersPanel({ isMaster }: { isMaster: boolean }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [masterEmail, setMasterEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        setUsers(d.users ?? []);
        setMasterEmail(d.masterEmail ?? null);
      })
      .catch(() => toast.error("회원 목록 로드 실패"));
  }, []);
  useEffect(load, [load]);

  const patch = async (email: string, body: object) => {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(`실패: ${b.error ?? res.statusText}`);
      return;
    }
    toast.success("변경됨");
    load();
  };

  const isMasterRow = (u: UserRow) =>
    masterEmail && u.email.toLowerCase() === masterEmail.toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newEmail) return;
          const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: newEmail }),
          });
          const b = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(`추가 실패: ${b.error ?? res.statusText}`);
            return;
          }
          toast.success("회원 추가됨");
          setNewEmail("");
          load();
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">회원 추가 (이메일)</span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@eland.co.kr"
            className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          추가
        </button>
      </form>

      {users === null ? (
        <p className="text-sm text-[var(--color-muted)]">로딩 중…</p>
      ) : (
        <div className="overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-left">
              <tr>
                {["이메일", "역할", "상태", "추가자", "최근 로그인", "작업"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const master = isMasterRow(u);
                return (
                  <tr key={u.email} className="border-t border-[var(--color-border)]">
                    <td className="px-2 py-1.5">{u.email}</td>
                    <td className="px-2 py-1.5">
                      {master ? (
                        <span className="font-medium text-violet-700">master</span>
                      ) : isMaster ? (
                        <select
                          value={u.role}
                          onChange={(e) => patch(u.email, { role: e.target.value })}
                          className="rounded border border-[var(--color-border)] px-1 py-0.5"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        u.role
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {u.status === "withdrawn" ? (
                        <span className="text-rose-600">탈퇴</span>
                      ) : (
                        <span className="text-emerald-700">활성</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">{u.invitedBy ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {u.lastLoginAt ? fmt(u.lastLoginAt) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      {!master && u.status === "active" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`${u.email} 회원을 탈퇴 처리할까요? (로그인 차단)`))
                              patch(u.email, { status: "withdrawn" });
                          }}
                          className="rounded bg-rose-600 px-2 py-1 text-white"
                        >
                          탈퇴
                        </button>
                      )}
                      {!master && u.status === "withdrawn" && (
                        <button
                          type="button"
                          onClick={() => patch(u.email, { status: "active" })}
                          className="rounded border border-[var(--color-border)] px-2 py-1"
                        >
                          복구
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!isMaster && (
        <p className="text-xs text-[var(--color-muted)]">
          역할(admin) 지정은 마스터 관리자만 가능합니다.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// 접속 로그
// ============================================================================
interface LogRow {
  id: number;
  email: string;
  ip: string | null;
  success: boolean;
  reason: string | null;
  at: string;
}

function LogsPanel() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  useEffect(() => {
    fetch("/api/admin/login-logs")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs ?? []))
      .catch(() => toast.error("접속 로그 로드 실패"));
  }, []);
  return logs === null ? (
    <p className="text-sm text-[var(--color-muted)]">로딩 중…</p>
  ) : logs.length === 0 ? (
    <p className="text-sm text-[var(--color-muted)]">접속 로그가 없습니다.</p>
  ) : (
    <div className="overflow-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 text-left">
          <tr>
            {["시간", "이메일", "IP", "성공", "사유"].map((h) => (
              <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t border-[var(--color-border)]">
              <td className="px-2 py-1.5">{fmt(l.at)}</td>
              <td className="px-2 py-1.5">{l.email}</td>
              <td className="px-2 py-1.5">{l.ip ?? "—"}</td>
              <td className="px-2 py-1.5">
                {l.success ? (
                  <span className="text-emerald-700">성공</span>
                ) : (
                  <span className="text-rose-600">실패</span>
                )}
              </td>
              <td className="px-2 py-1.5">{l.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
