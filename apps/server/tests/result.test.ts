import { describe, expect, test } from "bun:test";
import { fail, ok } from "../src/chat/result";

describe("ok", () => {
  test("wraps a value in a success result", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  test("preserves an object value by reference", () => {
    const value = { id: "x", nested: { n: 1 } };
    const result = ok(value);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(value);
  });

  test("wraps null as a valid success value", () => {
    expect(ok(null)).toEqual({ ok: true, value: null });
  });
});

describe("fail", () => {
  test("defaults to a 400 status when none is given", () => {
    expect(fail("bad input")).toEqual({
      ok: false,
      error: "bad input",
      status: 400,
    });
  });

  test("carries an explicit 403 status", () => {
    expect(fail("forbidden", 403)).toEqual({
      ok: false,
      error: "forbidden",
      status: 403,
    });
  });

  test("carries an explicit 404 status", () => {
    expect(fail("missing", 404).status).toBe(404);
  });

  test("carries an explicit 409 status", () => {
    expect(fail("conflict", 409).status).toBe(409);
  });

  test("carries an explicit 401 status", () => {
    expect(fail("unauth", 401).status).toBe(401);
  });

  test("carries an explicit 500 status", () => {
    expect(fail("server error", 500).status).toBe(500);
  });

  test("always sets ok to false", () => {
    expect(fail("x").ok).toBe(false);
    expect(fail("x", 409).ok).toBe(false);
  });
});
