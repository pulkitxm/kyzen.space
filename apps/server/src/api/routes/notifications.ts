import { notifications } from "@kyzen/database";
import { Hono } from "hono";
import { assembleNotification } from "../../chat/assemble";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const notificationsRouter = new Hono<AuthEnv>()
  .use("*", requireAuth)

  .get("/", async (c) => {
    const userId = c.get("userId");
    const cursor = c.req.query("cursor") || undefined;
    const unreadOnly = ["1", "true"].includes(c.req.query("unreadOnly") ?? "");
    const { notifications: rows, nextCursor } = await notifications.listForUser(
      userId,
      { cursor, unreadOnly },
    );
    const list = await Promise.all(rows.map(assembleNotification));
    return c.json({ notifications: list, nextCursor });
  })

  .get("/unread-count", async (c) => {
    const userId = c.get("userId");
    return c.json({ count: await notifications.unreadCount(userId) });
  })

  .post("/:id/read", async (c) => {
    const userId = c.get("userId");
    await notifications.markRead(c.req.param("id"), userId);
    return c.json({ ok: true });
  })

  .post("/read-all", async (c) => {
    const userId = c.get("userId");
    await notifications.markAllRead(userId);
    return c.json({ ok: true });
  });
