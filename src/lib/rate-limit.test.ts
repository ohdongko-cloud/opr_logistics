import { beforeEach, describe, expect, it } from "vitest";
import { clearRateLimits, clientIp, rateLimit } from "./rate-limit";

describe("rateLimit (fixed window)", () => {
  beforeEach(() => clearRateLimits());

  it("limit 내에서는 ok", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60).ok).toBe(true);
    }
  });

  it("limit 초과 시 차단 + retryAfter", () => {
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60);
    const r = rateLimit("k", 5, 60);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("키가 다르면 독립 카운터", () => {
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60);
    expect(rateLimit("a", 5, 60).ok).toBe(false);
    expect(rateLimit("b", 5, 60).ok).toBe(true);
  });

  it("remaining 감소", () => {
    expect(rateLimit("k", 3, 60).remaining).toBe(2);
    expect(rateLimit("k", 3, 60).remaining).toBe(1);
    expect(rateLimit("k", 3, 60).remaining).toBe(0);
  });
});

describe("clientIp", () => {
  it("x-forwarded-for 첫 값", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });
  it("헤더 없으면 unknown", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
