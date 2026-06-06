import { describe, expect, it } from "bun:test";
import { RESERVED_USERNAMES } from "../src/constants";
import {
  isReservedUsername,
  isValidUsernameFormat,
  normalizeUsername,
} from "../src/types";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Alice_99 ")).toBe("alice_99");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeUsername("   ")).toBe("");
  });
});

describe("isValidUsernameFormat", () => {
  it("accepts lowercase letters, digits, and underscore within 3-30 chars", () => {
    expect(isValidUsernameFormat("alice")).toBe(true);
    expect(isValidUsernameFormat("a_b_2")).toBe(true);
    expect(isValidUsernameFormat("abc")).toBe(true);
    expect(isValidUsernameFormat("a".repeat(30))).toBe(true);
  });

  it("rejects too short, too long, and empty", () => {
    expect(isValidUsernameFormat("")).toBe(false);
    expect(isValidUsernameFormat("ab")).toBe(false);
    expect(isValidUsernameFormat("a".repeat(31))).toBe(false);
  });

  it("rejects uppercase, spaces, and symbols", () => {
    expect(isValidUsernameFormat("Alice")).toBe(false);
    expect(isValidUsernameFormat("al ice")).toBe(false);
    expect(isValidUsernameFormat("al-ice")).toBe(false);
    expect(isValidUsernameFormat("al.ice")).toBe(false);
  });
});

describe("RESERVED_USERNAMES / isReservedUsername", () => {
  it("reserves top-level routes and server namespaces", () => {
    for (const name of [
      "api",
      "auth",
      "games",
      "profile",
      "settings",
      "chat",
    ]) {
      expect(RESERVED_USERNAMES.has(name)).toBe(true);
      expect(isReservedUsername(name)).toBe(true);
    }
  });

  it("does not reserve ordinary names", () => {
    expect(isReservedUsername("alice")).toBe(false);
  });
});
