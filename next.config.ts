import type { NextConfig } from "next";

/**
 * 전역 보안 헤더 (PRD §4.11 F11 / M9)
 * - 내부 도구 — 외부 자원 임베드 불필요. CSP는 'self' 기반.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js 인라인 스크립트/스타일을 위해 'unsafe-inline' 허용 (앱이 정적이라 위험 낮음)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      // Vercel Blob 다운로드 URL은 *.public.blob.vercel-storage.com 패턴
      "connect-src 'self' https://*.blob.vercel-storage.com https://*.public.blob.vercel-storage.com https://*.neon.tech",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  // 운영(HTTPS)에서만 의미 있음. preview 도메인도 HTTPS라 OK.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const config: NextConfig = {
  // 업로드 RAW 엑셀은 서버 액션/Route Handler로 받음.
  // 단일 파일 50MB, 총 100MB는 PRD F11 / N6에 정의.
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
