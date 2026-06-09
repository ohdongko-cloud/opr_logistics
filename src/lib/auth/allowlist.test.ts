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

  it("returns empty set when env not set", () => {
    expect(getAllowedEmails().size).toBe(0);
    expect(isEmailAllowed("alice@gmail.com")).toBe(false);
  });

  it("parses comma-separated list", () => {
    process.env.ALLOWED_EMAILS = "alice@gmail.com, bob@gmail.com ,carol@gmail.com";
    expect(getAllowedEmails().size).toBe(3);
    expect(isEmailAllowed("alice@gmail.com")).toBe(true);
    expect(isEmailAllowed("BOB@gmail.com")).toBe(true); // case-insensitive
    expect(isEmailAllowed("dave@gmail.com")).toBe(false);
  });

  it("ignores entries without @", () => {
    process.env.ALLOWED_EMAILS = "alice@gmail.com,bogus,bob@gmail.com";
    expect(getAllowedEmails().size).toBe(2);
  });

  it("normalizeEmail trims + lowercases", () => {
    expect(normalizeEmail("  Alice@GMAIL.com  ")).toBe("alice@gmail.com");
  });
});
