import type { NextConfig } from "next";

const config: NextConfig = {
  // 업로드 RAW 엑셀은 서버 액션/Route Handler로 받음.
  // 단일 파일 50MB, 총 100MB는 PRD F11 / N6에 정의.
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  // 인쇄 미리보기 시 외부 폰트(Noto Sans KR)는 next/font로 self-host.
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
