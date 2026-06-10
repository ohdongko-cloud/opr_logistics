/**
 * 잡 소유권 검증 헬퍼 (PRD §4.11 F11 / M9 IDOR 차단)
 *
 * 존재 여부 누출 방지를 위해 소유자 불일치 시 403이 아닌 404로 응답.
 */
import { getCurrentEmail } from "@/lib/auth/session";
import type { JobRecord } from "@/lib/job/store";

export interface OwnershipResult {
  ok: boolean;
  email: string | null;
}

/**
 * 현재 세션 이메일과 잡 소유자 비교.
 *  - 세션 없으면 → ok:false (미들웨어가 잡았어야 함; 방어적)
 *  - 잡의 createdByEmail이 null이면 → ok:true (M8 이전에 만들어진 레거시 잡은 누구나 접근 허용)
 *  - 일치하면 → ok:true
 *  - 그 외 → ok:false (호출자가 404로 응답)
 */
export async function checkJobOwnership(
  job: Pick<JobRecord, "createdByEmail">
): Promise<OwnershipResult> {
  const email = await getCurrentEmail();
  if (!email) return { ok: false, email: null };
  if (job.createdByEmail === null) return { ok: true, email };
  if (job.createdByEmail.toLowerCase() === email.toLowerCase()) {
    return { ok: true, email };
  }
  return { ok: false, email };
}
