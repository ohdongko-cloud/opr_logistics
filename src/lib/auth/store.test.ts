import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canSendOtp,
  clearOtpStore,
  saveOtp,
  verifyOtp,
} from "./store";
import { hashOtpCode, verifyOtpHash } from "./otp";

const orig = process.env.OTP_PEPPER;
beforeEach(() => {
  process.env.OTP_PEPPER = "test_store_pepper_padding_xxxxxxxxxxxxxxxxxxxxx";
  clearOtpStore();
});
afterEach(() => {
  if (orig === undefined) delete process.env.OTP_PEPPER;
  else process.env.OTP_PEPPER = orig;
});

describe("OTP store", () => {
  it("saves and verifies", async () => {
    const code = "123456";
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode(code) });
    const r = await verifyOtp("a@b.com", (h) => verifyOtpHash(code, h));
    expect(r.ok).toBe(true);
  });

  it("rejects mismatch", async () => {
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode("111111") });
    const r = await verifyOtp("a@b.com", (h) => verifyOtpHash("222222", h));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("mismatch");
  });

  it("locks after 5 attempts", async () => {
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode("111111") });
    for (let i = 0; i < 5; i++) {
      await verifyOtp("a@b.com", () => false);
    }
    const r = await verifyOtp("a@b.com", () => true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_many_attempts");
  });

  it("returns not_found after consumption (single-use)", async () => {
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode("999999") });
    const r1 = await verifyOtp("a@b.com", (h) => verifyOtpHash("999999", h));
    expect(r1.ok).toBe(true);
    const r2 = await verifyOtp("a@b.com", (h) => verifyOtpHash("999999", h));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("not_found");
  });

  it("canSendOtp throttles within 60s", async () => {
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode("111111") });
    const r = await canSendOtp("a@b.com");
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("canSendOtp ok when previous consumed", async () => {
    await saveOtp({ email: "a@b.com", codeHash: hashOtpCode("123456") });
    await verifyOtp("a@b.com", (h) => verifyOtpHash("123456", h));
    expect((await canSendOtp("a@b.com")).ok).toBe(true);
  });
});
