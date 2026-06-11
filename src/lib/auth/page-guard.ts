import { redirect } from "next/navigation";

import { hasPassword } from "./roles";

/**
 * 보호 페이지 공통 가드 (PRD #0004 F6).
 * 로그인했으나 비밀번호 미설정이면 /set-password로 강제 이동(전환 강제).
 * email이 null(미로그인)이면 아무것도 하지 않음 — 각 페이지의 로그인 가드가 처리.
 * (/set-password 페이지 자신은 이 가드를 호출하지 않는다 — 루프 방지)
 */
export async function enforcePasswordSet(email: string | null): Promise<void> {
  if (email && !(await hasPassword(email))) {
    redirect("/set-password");
  }
}
