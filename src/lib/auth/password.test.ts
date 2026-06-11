import { describe, expect, it } from "vitest";

import {
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "./password";

describe("hashPassword / verifyPassword (PRD #0004 F2)", () => {
  it("라운드트립: 올바른 비밀번호는 true", async () => {
    const enc = await hashPassword("correct horse 8");
    expect(enc.startsWith("scrypt$16384$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse 8", enc)).toBe(true);
  });

  it("틀린 비밀번호는 false", async () => {
    const enc = await hashPassword("password1");
    expect(await verifyPassword("password2", enc)).toBe(false);
  });

  it("같은 평문도 매번 다른 해시(salt 랜덤)", async () => {
    const a = await hashPassword("samepass1");
    const b = await hashPassword("samepass1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("samepass1", a)).toBe(true);
    expect(await verifyPassword("samepass1", b)).toBe(true);
  });

  it("형식 깨진/누락 인코딩은 throw 없이 false", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", undefined)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "notscrypt$1$2$3")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$zz$zz")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$16384$8$1$AA$BB")).toBe(false);
  });
});

describe("validatePasswordPolicy (8자+)", () => {
  it("7자 거부, 8자 통과", () => {
    expect(validatePasswordPolicy("1234567").ok).toBe(false);
    expect(validatePasswordPolicy("1234567").error).toBe("too_short");
    expect(validatePasswordPolicy("12345678").ok).toBe(true);
  });
  it("공백 전용/빈값 거부", () => {
    expect(validatePasswordPolicy("").ok).toBe(false);
    expect(validatePasswordPolicy("        ").error).toBe("blank");
  });
  it("상한 초과 거부", () => {
    expect(validatePasswordPolicy("a".repeat(201)).error).toBe("too_long");
  });
});
