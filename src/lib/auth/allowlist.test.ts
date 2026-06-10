import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAllowedEmails, isEmailAllowed, normalizeEmail } from "./allowlist";

const origEnv = process.env.ALLOWED_EMAILS;

describe("allowlist", () => {
  beforeEach(() => {
    delete process.env.ALLOWED_EMAILS;
  });
  afterEach(() => {
    process.env.ALLOWED_EMAILS = origEnv;
  });

  it("returns empty allowlist when env not set", () => {
    expect(getAllowedEmails().emails.size).toBe(0);
    expect(getAllowedEmails().domains.size).toBe(0);
    expect(isEmailAllowed("alice@gmail.com")).toBe(false);
  });

  it("parses comma-separated exact emails", () => {
    process.env.ALLOWED_EMAILS =
      "alice@gmail.com, bob@gmail.com ,carol@gmail.com";
    expect(getAllowedEmails().emails.size).toBe(3);
    expect(isEmailAllowed("alice@gmail.com")).toBe(true);
    expect(isEmailAllowed("BOB@gmail.com")).toBe(true); // case-insensitive
    expect(isEmailAllowed("dave@gmail.com")).toBe(false);
  });

  it("supports domain wildcard '@example.com'", () => {
    process.env.ALLOWED_EMAILS = "@eland.co.kr";
    expect(getAllowedEmails().domains.has("@eland.co.kr")).toBe(true);
    expect(isEmailAllowed("anyone@eland.co.kr")).toBe(true);
    expect(isEmailAllowed("john.doe@eland.co.kr")).toBe(true);
    expect(isEmailAllowed("Anyone@ELAND.co.kr")).toBe(true); // case-insensitive
    expect(isEmailAllowed("anyone@gmail.com")).toBe(false);
    expect(isEmailAllowed("attacker@eland.co.kr.evil.com")).toBe(false); // suffix 회피 방지
  });

  it("supports mix of domain + exact emails", () => {
    process.env.ALLOWED_EMAILS =
      "@eland.co.kr, ohdongko@gmail.com, special@example.com";
    expect(isEmailAllowed("staff@eland.co.kr")).toBe(true);
    expect(isEmailAllowed("ohdongko@gmail.com")).toBe(true);
    expect(isEmailAllowed("special@example.com")).toBe(true);
    expect(isEmailAllowed("other@example.com")).toBe(false);
    expect(isEmailAllowed("other@gmail.com")).toBe(false);
  });

  it("ignores invalid entries (no @, bare @, etc.)", () => {
    process.env.ALLOWED_EMAILS = "alice@gmail.com,bogus,bob@gmail.com,@,@x";
    const a = getAllowedEmails();
    expect(a.emails.size).toBe(2); // alice, bob
    expect(a.domains.size).toBe(0); // @ / @x 무시 (@만 또는 . 없음)
  });

  it("rejects suffix injection (e.g. '@eland.co.kr.attacker.com')", () => {
    process.env.ALLOWED_EMAILS = "@eland.co.kr";
    expect(isEmailAllowed("x@eland.co.kr.attacker.com")).toBe(false);
    expect(isEmailAllowed("x@another-eland.co.kr")).toBe(false);
  });

  it("normalizeEmail trims + lowercases", () => {
    expect(normalizeEmail("  Alice@GMAIL.com  ")).toBe("alice@gmail.com");
  });
});
