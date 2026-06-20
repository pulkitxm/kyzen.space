import { accountMerge } from "@kyzen/database";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const accountRouter = new Hono<AuthEnv>()
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
  })

  .get("/merge/pending", requireAuth, async (c) => {
    const userId = c.get("userId");
    const pending = await accountMerge.getPendingForTarget(userId);
    if (!pending) return c.json({ pending: null });
    const summary = await accountMerge.summarizeAnonAccount(pending.anonUserId);
    return c.json({
      pending: {
        id: pending.id,
        status: pending.status,
        createdAt: pending.createdAt,
        targetEmail: c.get("user").email ?? null,
        summary,
      },
    });
  })

  .post("/merge/:id/confirm", requireAuth, async (c) => {
    const userId = c.get("userId");
    const row = await accountMerge.getById(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.targetUserId !== userId) return c.json({ error: "Forbidden" }, 403);
    if (row.status !== "pending")
      return c.json({ error: "Already resolved" }, 409);
    await accountMerge.mergeAccounts(row.anonUserId, row.targetUserId);
    const resolved = await accountMerge.markResolved(row.id, "confirmed");
    return c.json({ ok: true, status: resolved?.status ?? "confirmed" });
  })

  .post("/merge/:id/discard", requireAuth, async (c) => {
    const userId = c.get("userId");
    const row = await accountMerge.getById(c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    if (row.targetUserId !== userId) return c.json({ error: "Forbidden" }, 403);
    if (row.status !== "pending")
      return c.json({ error: "Already resolved" }, 409);
    await accountMerge.deleteAnonUserData(row.anonUserId);
    const resolved = await accountMerge.markResolved(row.id, "discarded");
    return c.json({ ok: true, status: resolved?.status ?? "discarded" });
  });
