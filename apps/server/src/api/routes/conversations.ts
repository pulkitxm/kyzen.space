import { Hono } from "hono";
import {
  assembleConversation,
  assembleConversations,
  assembleMessages,
} from "../../chat/assemble";
import * as conversationsService from "../../chat/conversations-service";
import * as messagesService from "../../chat/messages-service";
import { conversations, messages } from "../../db";
import { getUserId, readJson } from "../auth-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

export const conversationsRouter = new Hono()
  .get("/", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const rows = await conversations.listForUser(userId);
    return c.json({ conversations: await assembleConversations(rows, userId) });
  })
  .post("/dm", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await readJson(c);
    const targetId = typeof body?.userId === "string" ? body.userId : null;
    if (!targetId) return c.json({ error: "userId is required" }, 400);
    const res = await conversationsService.createDm(userId, targetId);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ conversation: res.value });
  })
  .post("/group", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await readJson(c);
    const name = typeof body?.name === "string" ? body.name : "";
    const memberIds = asStringArray(body?.memberIds);
    const res = await conversationsService.createGroup(userId, name, memberIds);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ conversation: res.value }, 201);
  })
  .get("/:id", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Not found" }, 404);
    if (!(await conversations.isMember(id, userId))) {
      return c.json({ error: "Not found" }, 404);
    }
    const conv = await conversations.getById(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    return c.json({ conversation: await assembleConversation(conv, userId) });
  })
  .get("/:id/messages", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Not found" }, 404);
    if (!(await conversations.isMember(id, userId))) {
      return c.json({ error: "Not found" }, 404);
    }
    const cursor = c.req.query("cursor") || undefined;
    const rawLimit = Number.parseInt(c.req.query("limit") ?? "30", 10);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
    const { messages: rows, nextCursor } = await messages.listMessages(id, {
      cursor,
      limit,
    });
    return c.json({ messages: await assembleMessages(rows), nextCursor });
  })
  .post("/:id/messages", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Not found" }, 404);
    const body = await readJson(c);
    const res = await messagesService.sendMessage({
      conversationId: id,
      senderId: userId,
      kind: body?.kind === "gif" ? "gif" : "text",
      body: typeof body?.body === "string" ? body.body : null,
      metadata:
        body?.metadata && typeof body.metadata === "object"
          ? (body.metadata as never)
          : null,
      clientId: typeof body?.clientId === "string" ? body.clientId : undefined,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ message: res.value }, 201);
  })
  .post("/:id/read", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const body = await readJson(c);
    const messageId =
      typeof body?.messageId === "string" ? body.messageId : null;
    if (!messageId) return c.json({ error: "messageId is required" }, 400);
    const res = await messagesService.markRead(userId, id, messageId);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true });
  })
  .post("/:id/members", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const id = c.req.param("id");
    const body = await readJson(c);
    const res = await conversationsService.addMembers(
      userId,
      id,
      asStringArray(body?.userIds),
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ conversation: res.value });
  })
  .delete("/:id/members/:userId", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const res = await conversationsService.removeMember(
      userId,
      c.req.param("id"),
      c.req.param("userId"),
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ ok: true });
  })
  .patch("/:id", async (c) => {
    const userId = await getUserId(c);
    if (!userId) return c.json({ error: "Unauthorized" }, 401);
    const body = await readJson(c);
    const name = typeof body?.name === "string" ? body.name : "";
    const res = await conversationsService.renameGroup(
      userId,
      c.req.param("id"),
      name,
    );
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json({ conversation: res.value });
  });
