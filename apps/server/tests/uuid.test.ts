import { describe, expect, test } from "bun:test";
import { isUuid } from "../src/lib/uuid";

const CANONICAL = "11111111-1111-1111-1111-111111111111";

describe("isUuid", () => {
  test("accepts a canonical lowercase v4-shaped uuid", () => {
    expect(isUuid(CANONICAL)).toBe(true);
  });

  test("accepts an uppercase uuid (case-insensitive)", () => {
    expect(isUuid(CANONICAL.toUpperCase())).toBe(true);
  });

  test("accepts a mixed-case uuid", () => {
    expect(isUuid("4A3b2C1d-0E9f-1234-5678-90ABcdef0011")).toBe(true);
  });

  test("is version-agnostic over hex nibbles", () => {
    expect(isUuid("4a3b2c1d-0e9f-7234-c678-90abcdef0011")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(true);
  });

  test("rejects the empty string", () => {
    expect(isUuid("")).toBe(false);
  });

  test("rejects a free-form non-uuid string", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  test("rejects a game room code", () => {
    expect(isUuid("K7P2QX")).toBe(false);
  });

  test("rejects a uuid with leading whitespace (anchored)", () => {
    expect(isUuid(` ${CANONICAL}`)).toBe(false);
  });

  test("rejects a uuid with trailing whitespace (anchored)", () => {
    expect(isUuid(`${CANONICAL} `)).toBe(false);
  });

  test("rejects a uuid with a trailing newline (anchored, no m flag)", () => {
    expect(isUuid(`${CANONICAL}\n`)).toBe(false);
  });

  test("rejects a final segment that is one hex short", () => {
    expect(isUuid("11111111-1111-1111-1111-11111111111")).toBe(false);
  });

  test("rejects a final segment that is one hex long", () => {
    expect(isUuid("11111111-1111-1111-1111-1111111111111")).toBe(false);
  });

  test("rejects a first segment that is one hex short", () => {
    expect(isUuid("1111111-1111-1111-1111-111111111111")).toBe(false);
  });

  test("rejects a non-hex character (g) in the first segment", () => {
    expect(isUuid("g1111111-1111-1111-1111-111111111111")).toBe(false);
  });

  test("rejects the same 32 hex characters without dashes", () => {
    expect(isUuid("11111111111111111111111111111111")).toBe(false);
  });

  test("rejects dashes in the wrong positions", () => {
    expect(isUuid("111111-111111-1111-1111-1111111111111")).toBe(false);
  });
});
