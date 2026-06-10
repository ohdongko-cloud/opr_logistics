/**
 * checkJobOwnership 단위 테스트 — 세션 모킹
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentEmail: vi.fn(),
}));

import { checkJobOwnership } from "./ownership";
import { getCurrentEmail } from "@/lib/auth/session";

describe("checkJobOwnership (IDOR 차단)", () => {
  it("returns ok:false when no session", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue(null);
    const r = await checkJobOwnership({ createdByEmail: "alice@gmail.com" });
    expect(r.ok).toBe(false);
  });

  it("returns ok:true when emails match (case-insensitive)", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue("Alice@Gmail.com");
    const r = await checkJobOwnership({ createdByEmail: "alice@gmail.com" });
    expect(r.ok).toBe(true);
    expect(r.email).toBe("Alice@Gmail.com");
  });

  it("returns ok:false when emails mismatch (IDOR 차단)", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue("bob@gmail.com");
    const r = await checkJobOwnership({ createdByEmail: "alice@gmail.com" });
    expect(r.ok).toBe(false);
  });

  it("returns ok:true for legacy jobs without createdByEmail (M8 이전)", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue("anyone@gmail.com");
    const r = await checkJobOwnership({ createdByEmail: null });
    expect(r.ok).toBe(true);
  });
});
