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

  test("encodeCursor accepts an ISO string createdAt as well as a Date", () => {
    const iso = "2026-03-04T05:06:07.000Z";
    const back = decodeCursor(
      encodeCursor(new Date(iso) as unknown as Date, "x"),
    );
    const fromString = decodeCursor(encodeCursor(iso as unknown as Date, "x"));
    expect(back?.createdAt.toISOString()).toBe(iso);
    expect(fromString?.createdAt.toISOString()).toBe(iso);
    expect(fromString?.id).toBe("x");
  });

  test("truncates an id that itself contains a '|' to the part before the first pipe", () => {
    const d = new Date("2026-07-08T09:10:11.000Z");
    const back = decodeCursor(encodeCursor(d, "a|b|c"));
    expect(back?.id).toBe("a");
    expect(back?.createdAt.toISOString()).toBe(d.toISOString());
  });

  test("decodes a valid base64 cursor that is not UTF-8 garbage", () => {
    const d = new Date("2026-12-31T23:59:59.999Z");
    const back = decodeCursor(encodeCursor(d, "uuid-9999"));
    expect(back?.id).toBe("uuid-9999");
    expect(back?.createdAt.toISOString()).toBe(d.toISOString());
  });

  test("rejects a cursor whose payload is empty before the separator", () => {
    const noIso = Buffer.from("|id-only").toString("base64");
    expect(decodeCursor(noIso)).toBeNull();
  });

  test("rejects a cursor whose decoded payload is only whitespace", () => {
    const whitespace = Buffer.from("   ").toString("base64");
    expect(decodeCursor(whitespace)).toBeNull();
  });
});
