import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPR Logistics — 피킹지시서 자동 분류·출력",
  description: "물류 현장 피킹/패킹 작업지시서 자동화 웹서비스 (PRD #0001)",
  robots: { index: false, follow: false }, // 내부 도구
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
