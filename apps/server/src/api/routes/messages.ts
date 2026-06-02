import { Hono } from "hono";
import * as messagesService from "../../chat/messages-service";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const messagesRouter = new Hono<AuthEnv>()
  .use("*", requireAuth)
  .delete("/:id", async (c) => {
    const userId = c.get("userId");
    const res = await messagesService.deleteMessage(userId, c.req.param("id"));
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ message: res.value });
  });
