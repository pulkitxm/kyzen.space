import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { readJson } from "../src/api/auth-context";

const app = new Hono().post("/echo", async (c) => {
  const body = await readJson(c);
  return c.json({ body, isNull: body === null });
});

const JSON_HEADERS = { "content-type": "application/json" };

async function post(init: RequestInit) {
  const res = await app.request("/echo", { method: "POST", ...init });
  return (await res.json()) as { body: unknown; isNull: boolean };
}

describe("readJson", () => {
  test("returns a parsed JSON object", async () => {
    const out = await post({
      headers: JSON_HEADERS,
      body: JSON.stringify({ a: 1, nested: { b: "x" } }),
    });
    expect(out.isNull).toBe(false);
    expect(out.body).toEqual({ a: 1, nested: { b: "x" } });
  });

  test("returns an empty object body verbatim", async () => {
    const out = await post({ headers: JSON_HEADERS, body: "{}" });
    expect(out.isNull).toBe(false);
    expect(out.body).toEqual({});
  });

  test("returns a JSON array (typeof object passes the guard)", async () => {
    const out = await post({
      headers: JSON_HEADERS,
      body: JSON.stringify([1, 2, 3]),
    });
    expect(out.isNull).toBe(false);
    expect(out.body).toEqual([1, 2, 3]);
  });

  test("returns null for a JSON null literal", async () => {
    const out = await post({ headers: JSON_HEADERS, body: "null" });
    expect(out.isNull).toBe(true);
  });

  test("returns null for a JSON number primitive", async () => {
    const out = await post({ headers: JSON_HEADERS, body: "42" });
    expect(out.isNull).toBe(true);
  });

  test("returns null for a JSON string primitive", async () => {
    const out = await post({ headers: JSON_HEADERS, body: '"hello"' });
    expect(out.isNull).toBe(true);
  });

  test("returns null for a JSON boolean primitive", async () => {
    const out = await post({ headers: JSON_HEADERS, body: "true" });
    expect(out.isNull).toBe(true);
  });

  test("returns null for a malformed JSON body (parse throws)", async () => {
    const out = await post({ headers: JSON_HEADERS, body: "{not valid json" });
    expect(out.isNull).toBe(true);
  });

  test("returns null for an empty request body", async () => {
    const out = await post({ headers: JSON_HEADERS });
    expect(out.isNull).toBe(true);
  });
});
