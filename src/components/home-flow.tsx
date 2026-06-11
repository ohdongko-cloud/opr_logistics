"use client";

import { JobFlow } from "@/components/job-flow";

/**
 * 홈 인라인 호스팅 (PRD #0002 F12/F14).
 * 업로드(STO/1단계)를 진행바 첫 단계(①)로 통합 — JobFlow가 initialView=null부터 호스팅한다.
 * homeMode: "+ 새 작업" 시 라우트 이동 없이 업로드 화면으로 복귀.
 */
export function HomeFlow() {
  return <JobFlow initialView={null} homeMode />;
}
