/**
 * 세션 토큰 (jose JWT) + 쿠키 관리 (PRD §4.11 F11 / M7)
 *
 * - HS256 + SESSION_SECRET 서명
 * - 24h TTL
 * - HttpOnly + SameSite=lax + (production) Secure 쿠키
 */
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "opr_sess";
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface SessionPayload {
  email: string;
  /** jose가 자동 set */
  iat?: number;
  exp?: number;
}

function getSecretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(email: string): Promise<string> {
  const token = await new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecretKey());
  return token;
}

export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

/** 쿠키 setter — Route Handler / Server Action 에서 호출 */
export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(COOKIE_NAME)?.value;
}

/** 현재 요청의 인증 이메일 (없으면 null) */
export async function getCurrentEmail(): Promise<string | null> {
  const token = await readSessionCookie();
  const payload = await verifySession(token);
  return payload?.email ?? null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
