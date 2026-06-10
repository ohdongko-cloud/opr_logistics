import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

const orig = process.env.SESSION_SECRET;
beforeEach(() => {
  process.env.SESSION_SECRET = "test_session_secret_unit_only_padding_xxxxxxxxxx";
});
afterEach(() => {
  if (orig === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = orig;
});

describe("session jwt", () => {
  it("signs and verifies a session token", async () => {
    const t = await signSession("alice@gmail.com");
    const p = await verifySession(t);
    expect(p?.email).toBe("alice@gmail.com");
  });

  it("returns null for tampered token", async () => {
    const t = await signSession("alice@gmail.com");
    const tampered = t.slice(0, -2) + "xx";
    expect(await verifySession(tampered)).toBeNull();
  });

  it("returns null for empty/undefined", async () => {
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("throws when SESSION_SECRET too short", async () => {
    process.env.SESSION_SECRET = "tooshort";
    await expect(signSession("a@b.com")).rejects.toThrowError(/32자/);
  });
});
