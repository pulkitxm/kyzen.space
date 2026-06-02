import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AuthEnv } from "../src/api/middleware/auth";

type Session = {
  user: { id: string; name: string | null; email: string | null };
} | null;

let currentSession: Session = null;

mock.module("../src/auth", () => ({
  getAuth: () => ({
    api: { getSession: async () => currentSession },
  }),
}));

const { requireAuth } = await import("../src/api/middleware/auth");

const app = new Hono<AuthEnv>()
  .use("*", requireAuth)
  .get("/whoami", (c) =>
    c.json({ userId: c.get("userId"), name: c.get("user").name }),
  );

beforeEach(() => {
  currentSession = null;
});

describe("requireAuth", () => {
  it("returns 401 when there is no session", async () => {
    const res = await app.request("/whoami");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("passes through and exposes the user id when authenticated", async () => {
    currentSession = { user: { id: "user-7", name: "Sam", email: "s@e.com" } };
    const res = await app.request("/whoami");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user-7", name: "Sam" });
  });
});
