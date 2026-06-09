/**
 * Gmail SMTP transporter (PRD M7)
 *
 * 환경변수:
 *   SMTP_HOST          smtp.gmail.com
 *   SMTP_PORT          587 (STARTTLS) 또는 465 (SSL)
 *   SMTP_USER          gmail 주소
 *   SMTP_PASS          16자리 앱 비밀번호 (Gmail 본 비밀번호 아님)
 *   SMTP_FROM          "이름 <gmail주소>" 형태 (SMTP_USER와 동일 주소)
 */
import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function getTransporter(): Transporter {
  if (cached) return cached;
  const host = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("SMTP_USER / SMTP_PASS 환경변수가 설정되지 않았습니다.");
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465=SSL, 587=STARTTLS
    auth: { user, pass: pass.replace(/\s+/g, "") }, // Gmail 앱 비밀번호 공백 허용
  });
  return cached;
}

export async function sendOtpEmail(input: {
  to: string;
  code: string;
  ip?: string | null;
}) {
  const from =
    process.env.SMTP_FROM ?? `OPR Logistics <${process.env.SMTP_USER}>`;
  const transporter = getTransporter();
  const subject = `[OPR Logistics] 인증 코드 ${input.code}`;
  const text = [
    `OPR Logistics 로그인 인증 코드`,
    ``,
    `코드: ${input.code}`,
    `유효시간: 10분`,
    ``,
    `만약 본인이 요청한 게 아니라면 이 메일을 무시하세요.`,
    input.ip ? `요청 IP: ${input.ip}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111;">
      <h2 style="margin:0 0 16px;font-size:18px;">OPR Logistics 로그인 인증</h2>
      <p style="margin:0 0 8px;color:#444;">아래 코드를 로그인 화면에 입력하세요. 유효시간 10분.</p>
      <div style="font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:32px;font-weight:600;letter-spacing:8px;background:#f4f4f5;border-radius:8px;padding:16px 24px;text-align:center;margin:16px 0;">${input.code}</div>
      <p style="margin:16px 0 0;color:#666;font-size:12px;">만약 본인이 요청한 게 아니라면 이 메일을 무시하세요${input.ip ? ` (요청 IP: ${input.ip})` : ""}.</p>
    </div>
  `;
  await transporter.sendMail({ from, to: input.to, subject, text, html });
}
