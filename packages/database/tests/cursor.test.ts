import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor } from "../src/repositories/cursor";

describe("keyset pagination cursor", () => {
  test("round-trips createdAt + id", () => {
    const d = new Date("2026-05-30T10:00:00.000Z");
    const cursor = encodeCursor(d, "abc-123");
    const back = decodeCursor(cursor);
    expect(back?.id).toBe("abc-123");
    expect(back?.createdAt.toISOString()).toBe(d.toISOString());
  });

  test("ids containing separators survive (split only on first '|')", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    const back = decodeCursor(encodeCursor(d, "id"));
    expect(back?.id).toBe("id");
  });

  test("rejects malformed cursors", () => {
    expect(decodeCursor("not-valid-base64-$$$")).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  test("rejects a decodable cursor whose timestamp is not a valid date", () => {
    const bad = Buffer.from("not-a-date|id-123").toString("base64");
    expect(decodeCursor(bad)).toBeNull();
  });

  test("rejects a decodable cursor that has no separator", () => {
    const noSep = Buffer.from("2026-05-30T10:00:00.000Z").toString("base64");
    expect(decodeCursor(noSep)).toBeNull();
  });

  test("rejects a cursor with a valid timestamp but an empty id", () => {
    const emptyId = Buffer.from("2026-05-30T10:00:00.000Z|").toString("base64");
    expect(decodeCursor(emptyId)).toBeNull();
  });
});
