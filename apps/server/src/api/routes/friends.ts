import type { FriendState } from "@gamelobby/chat-core";
import { Hono } from "hono";
import { assembleFriendships } from "../../chat/assemble";
import * as friendsService from "../../chat/friends-service";
import { friends, profiles } from "../../db";
import { getUserId, readJson } from "../auth-context";
import { serializePublicUser } from "../serialize";

export const friendsRouter = new Hono()
  .get("/", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const rows = await friends.listAccepted(userId);
    return c.json({ friends: await assembleFriendships(rows, userId) });
  })
  .get("/requests", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const [incoming, outgoing] = await Promise.all([
      friends.listPendingIncoming(userId),
      friends.listPendingOutgoing(userId),
    ]);
    return c.json({
      incoming: await assembleFriendships(incoming, userId),
      outgoing: await assembleFriendships(outgoing, userId),
    });
  })
  .get("/search", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ users: [] });

    const hits = await profiles.searchByUsername(q, userId, 20);
    const all = await friends.listAllForUser(userId);
    const stateByOther = new Map<string, FriendState>();
    for (const f of all) {
      const otherId = f.requesterId === userId ? f.addresseeId : f.requesterId;
      let state: FriendState = "none";
      if (f.status === "accepted") state = "friends";
      else if (f.status === "pending") {
        state = f.requesterId === userId ? "outgoing" : "incoming";
      }
      stateByOther.set(otherId, state);
    }
    const users = hits.map((u) => ({
      ...serializePublicUser(u),
      friendState: stateByOther.get(u.id) ?? ("none" as FriendState),
    }));
    return c.json({ users });
  })
  .post("/requests", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await readJson(c);
    const username = typeof body?.username === "string" ? body.username : null;
    if (!username) return c.json({ error: "username is required" }, 400);
    const res = await friendsService.sendFriendRequest(userId, username);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ request: res.value }, 201);
  })
  .post("/requests/:id/accept", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const res = await friendsService.respondToRequest(
      userId,
      c.req.param("id"),
      "accept",
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ friendship: res.value });
  })
  .post("/requests/:id/decline", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const res = await friendsService.respondToRequest(
      userId,
      c.req.param("id"),
      "decline",
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true });
  })
  .delete("/:userId", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const res = await friendsService.removeFriend(
      userId,
      c.req.param("userId"),
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true });
  });
