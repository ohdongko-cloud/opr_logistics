import { redirect } from "next/navigation";

import { hasPassword } from "./roles";

/**
 * 보호 페이지 공통 가드 (PRD #0004 F6).
 * 로그인했으나 비밀번호 미설정이면 /set-password로 강제 이동(전환 강제).
 * email이 null(미로그인)이면 아무것도 하지 않음 — 각 페이지의 로그인 가드가 처리.
 * (/set-password 페이지 자신은 이 가드를 호출하지 않는다 — 루프 방지)
 */
export async function enforcePasswordSet(email: string | null): Promise<void> {
  if (!email) return;
  let hasPw: boolean;
  try {
    hasPw = await hasPassword(email);
  } catch {
    // password_hash 컬럼 미적용(마이그레이션 지연) 등 DB 오류 → 가드 스킵.
    // 비밀번호 기능이 준비되기 전에도 사이트가 정상 동작하도록(서버 예외로 다운 방지).
    return;
  }
  // redirect()는 NEXT_REDIRECT를 throw하므로 반드시 try/catch 밖에서 호출.
  if (!hasPw) redirect("/set-password");
}
