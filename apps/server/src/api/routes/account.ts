import { Hono } from "hono";
import { getAuth } from "../../auth";

/**
 * Session/account management. These mirror the old Next form-action endpoints
 * but live entirely on the backend now. They return JSON; the web client
 * navigates after a successful call.
 */
export const accountRouter = new Hono()
  .get("/sessions", async (c) => {
    const auth = getAuth();
    const headers = c.req.raw.headers;
    const current = await auth.api.getSession({ headers });
    if (!current?.session || !current.user)
      return c.json({ error: "Unauthorized" }, 401);

    const list = await auth.api.listSessions({ headers });
    const sorted = [...list].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return c.json({
      current: { session: current.session, user: current.user },
      sessions: sorted,
    });
  })
  .post("/sign-out", async (c) => {
    await getAuth().api.signOut({ headers: c.req.raw.headers });
    return c.json({ ok: true });
  })
  .post("/revoke-others", async (c) => {
    const auth = getAuth();
    const headers = c.req.raw.headers;
    const session = await auth.api.getSession({ headers });
    if (!session?.session) return c.json({ error: "Unauthorized" }, 401);
    await auth.api.revokeOtherSessions({ headers });
    return c.json({ ok: true });
  })
  .post("/revoke-session", async (c) => {
    const auth = getAuth();
    const headers = c.req.raw.headers;
    const current = await auth.api.getSession({ headers });
    if (!current?.session) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => null);
    const token = body && typeof body.token === "string" ? body.token : "";
    if (!token) return c.json({ error: "Missing token" }, 400);

    if (current.session.token === token) {
      await auth.api.signOut({ headers });
      return c.json({ ok: true, signedOut: true });
    }
    await auth.api.revokeSession({ headers, body: { token } });
    return c.json({ ok: true });
  });
