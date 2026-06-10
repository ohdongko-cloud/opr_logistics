/**
 * 잡 소유권 검증 헬퍼 (PRD §4.11 F11 / M9 IDOR 차단 / #0003 §10.6)
 *
 * 존재 여부 누출 방지를 위해 소유자 불일치 시 403이 아닌 404로 응답.
 * admin|master는 소유권 무관 접근 허용(역할은 내부에서 getRole로 판정 — 호출부 플래그 없음).
 */
import { normalizeEmail } from "@/lib/auth/allowlist";
import { getRole } from "@/lib/auth/roles";
import { getCurrentEmail } from "@/lib/auth/session";
import type { JobRecord } from "@/lib/job/store";

export interface OwnershipResult {
  ok: boolean;
  email: string | null;
}

/**
 * 현재 세션 이메일과 잡 소유자 비교.
 *  - 세션 없으면 → ok:false
 *  - admin|master → ok:true (소유권 우회, PRD #0003 §5.4 F4)
 *  - createdByEmail null(레거시) → 비-admin은 접근 불가로 강화 (#0003 §10.6)
 *  - 정확 일치 → ok:true
 *  - 그 외 → ok:false (호출자가 404)
 */
export async function checkJobOwnership(
  job: Pick<JobRecord, "createdByEmail">
): Promise<OwnershipResult> {
  const email = await getCurrentEmail();
  if (!email) return { ok: false, email: null };
  // admin|master 우회
  const role = await getRole(email);
  if (role === "admin" || role === "master") return { ok: true, email };
  // 소유자 비교 (정규화). 레거시 null은 비-admin 접근 불가.
  if (job.createdByEmail === null) return { ok: false, email };
  if (normalizeEmail(job.createdByEmail) === normalizeEmail(email)) {
    return { ok: true, email };
  }
  return { ok: false, email };
}
