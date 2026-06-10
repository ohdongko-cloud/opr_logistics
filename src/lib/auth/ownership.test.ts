/**
 * checkJobOwnership 단위 테스트 — 세션 모킹 (#0003: admin 우회 + 레거시 강화)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentEmail: vi.fn(),
}));

import { checkJobOwnership } from "./ownership";
import { getCurrentEmail } from "@/lib/auth/session";
import {
  clearRolesStore,
  patchUser,
  provisionLogin,
} from "@/lib/auth/roles";

const ORIG_MASTER = process.env.MASTER_ADMIN_EMAIL;
const ORIG_ALLOW = process.env.ALLOWED_EMAILS;

beforeEach(() => {
  clearRolesStore();
  process.env.MASTER_ADMIN_EMAIL = "boss@eland.co.kr";
  process.env.ALLOWED_EMAILS = "@eland.co.kr";
});
afterEach(() => {
  if (ORIG_MASTER === undefined) delete process.env.MASTER_ADMIN_EMAIL;
  else process.env.MASTER_ADMIN_EMAIL = ORIG_MASTER;
  if (ORIG_ALLOW === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIG_ALLOW;
});

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

  it("레거시 null 잡: 비-admin은 접근 불가 (#0003 §10.6 강화)", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue("anyone@gmail.com");
    const r = await checkJobOwnership({ createdByEmail: null });
    expect(r.ok).toBe(false);
  });

  it("admin은 타인 잡 우회 접근 허용", async () => {
    await provisionLogin("admin1@eland.co.kr");
    await patchUser({
      targetEmail: "admin1@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      role: "admin",
    });
    vi.mocked(getCurrentEmail).mockResolvedValue("admin1@eland.co.kr");
    const r = await checkJobOwnership({ createdByEmail: "someoneelse@x.com" });
    expect(r.ok).toBe(true);
  });

  it("master는 레거시 null 잡도 접근 허용", async () => {
    vi.mocked(getCurrentEmail).mockResolvedValue("boss@eland.co.kr");
    const r = await checkJobOwnership({ createdByEmail: null });
    expect(r.ok).toBe(true);
  });
});
