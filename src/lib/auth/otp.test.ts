import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateOtpCode,
  hashOtpCode,
  isOtpFormat,
  verifyOtpHash,
} from "./otp";

const orig = process.env.OTP_PEPPER;

beforeEach(() => {
  process.env.OTP_PEPPER = "0".repeat(32) + "_test_pepper_unit_padding_xxx";
});
afterEach(() => {
  if (orig === undefined) delete process.env.OTP_PEPPER;
  else process.env.OTP_PEPPER = orig;
});

describe("OTP code", () => {
  it("generateOtpCode returns 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      const c = generateOtpCode();
      expect(c).toMatch(/^\d{6}$/);
    }
  });

  it("isOtpFormat detects valid/invalid", () => {
    expect(isOtpFormat("123456")).toBe(true);
    expect(isOtpFormat("12345")).toBe(false);
    expect(isOtpFormat("12345a")).toBe(false);
    expect(isOtpFormat("1234567")).toBe(false);
  });

  it("hashOtpCode produces stable HMAC", () => {
    const a = hashOtpCode("123456");
    const b = hashOtpCode("123456");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("hashOtpCode throws if pepper missing", () => {
    delete process.env.OTP_PEPPER;
    expect(() => hashOtpCode("123456")).toThrowError();
  });

  it("hashOtpCode throws if pepper too short (<32)", () => {
    process.env.OTP_PEPPER = "tooshort";
    expect(() => hashOtpCode("123456")).toThrowError(/32자/);
  });

  it("verifyOtpHash timing-safe matches", () => {
    const h = hashOtpCode("000123");
    expect(verifyOtpHash("000123", h)).toBe(true);
    expect(verifyOtpHash("000124", h)).toBe(false);
  });
});
