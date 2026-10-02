import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
  cookies: async () => ({ toString: () => "session=synthetic-session" }),
}));

const { serverFetchJson } = await import("../lib/api-server");
const originalEnv = {
  APP_URL: process.env.APP_URL,
  API_URL: process.env.API_URL,
  VERCEL: process.env.VERCEL,
};
const backend = Bun.serve({
  port: 0,
  fetch(request) {
    return Response.json({
      path: new URL(request.url).pathname,
      query: new URL(request.url).search,
      cookie: request.headers.get("cookie"),
    });
  },
});

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

afterAll(() => backend.stop(true));

describe("server API routing", () => {
  test("reads the binding at request time and forwards the session and public API path", async () => {
    process.env.VERCEL = "1";
    process.env.APP_URL = backend.url.toString();
    process.env.API_URL = "http://127.0.0.1:1";

    const result = await serverFetchJson("/api/games/DEMO42?limit=5");
    expect(result).toEqual({
      path: "/api/games/DEMO42",
      query: "?limit=5",
      cookie: "session=synthetic-session",
    });
  });

  test("fails clearly when the Vercel binding is missing", async () => {
    process.env.VERCEL = "1";
    delete process.env.APP_URL;
    process.env.API_URL = backend.url.toString();

    await expect(serverFetchJson("/api/auth/get-session")).rejects.toThrow(
      "Missing APP_URL service binding",
    );
  });

  test("supports an explicit API target for host development", async () => {
    delete process.env.VERCEL;
    delete process.env.APP_URL;
    process.env.API_URL = backend.url.toString();

    expect(await serverFetchJson("/api/auth/get-session")).toEqual({
      path: "/api/auth/get-session",
      query: "",
      cookie: "session=synthetic-session",
    });
  });
});
