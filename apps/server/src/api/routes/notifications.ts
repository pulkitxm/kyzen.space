import { Hono } from "hono";
import { assembleNotification } from "../../chat/assemble";
import { notifications } from "../../db";
import { getUserId } from "../auth-context";

export const notificationsRouter = new Hono()
  .get("/", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
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
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ count: await notifications.unreadCount(userId) });
  })
  .post("/:id/read", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    await notifications.markRead(c.req.param("id"), userId);
    return c.json({ ok: true });
  })
  .post("/read-all", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    await notifications.markAllRead(userId);
    return c.json({ ok: true });
  });
