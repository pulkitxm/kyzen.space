import { Hono } from "hono";
import * as messagesService from "../../chat/messages-service";
import { getUserId } from "../auth-context";

export const messagesRouter = new Hono().delete("/:id", async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const res = await messagesService.deleteMessage(userId, c.req.param("id"));
  if (!res.ok) return c.json({ error: res.error }, res.status);
  return c.json({ message: res.value });
});
