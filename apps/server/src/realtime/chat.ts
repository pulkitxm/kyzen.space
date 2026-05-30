import { CHAT_EVENTS } from "@gamelobby/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import * as conversationsService from "../chat/conversations-service";
import * as messagesService from "../chat/messages-service";
import { conversations, notifications } from "../db";
import { convRoom, joinConvRoom, leaveConvRoom, userRoom } from "./rooms";
import { ack, ackErr, isObj, register, str, strArray } from "./socket-util";

/** Join the user's personal room + all conversation rooms on connect, so they
 * receive messages/notifications without an explicit client-side join. */
export async function joinUserRooms(socket: Socket): Promise<void> {
  const userId = socket.data.userId;
  void socket.join(userRoom(userId));
  const ids = await conversations.getConversationIdsForUser(userId);
  for (const id of ids) void socket.join(convRoom(id));
}

export function attachChatHandlers(io: IOServer, socket: Socket): void {
  const userId = socket.data.userId;

  register(socket, CHAT_EVENTS.conversationJoin, async (payload, cb) => {
    const id = isObj(payload) ? str(payload.conversationId) : null;
    if (!id) return ackErr(cb, "conversationId required");
    if (!(await conversations.isMember(id, userId))) {
      return ackErr(cb, "Not a member of this conversation");
    }
    joinConvRoom(socket, id);
    cb?.({ ok: true });
  });

  register(socket, CHAT_EVENTS.conversationLeave, async (payload, cb) => {
    const id = isObj(payload) ? str(payload.conversationId) : null;
    if (id) leaveConvRoom(socket, id);
    cb?.({ ok: true });
  });

  register(socket, CHAT_EVENTS.sendMessage, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const conversationId = str(payload.conversationId);
    if (!conversationId) return ackErr(cb, "conversationId required");
    const res = await messagesService.sendMessage({
      conversationId,
      senderId: userId,
      kind: payload.kind === "gif" ? "gif" : "text",
      body: str(payload.body),
      metadata: isObj(payload.metadata) ? (payload.metadata as never) : null,
      clientId: str(payload.clientId) ?? undefined,
    });
    ack(cb, res, "message");
  });

  register(socket, CHAT_EVENTS.markRead, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const conversationId = str(payload.conversationId);
    const messageId = str(payload.messageId);
    if (!conversationId || !messageId) return ackErr(cb, "Invalid payload");
    ack(
      cb,
      await messagesService.markRead(userId, conversationId, messageId),
      "ok",
    );
  });

  register(socket, CHAT_EVENTS.createDm, async (payload, cb) => {
    const otherId = isObj(payload) ? str(payload.userId) : null;
    if (!otherId) return ackErr(cb, "userId required");
    ack(
      cb,
      await conversationsService.createDm(userId, otherId),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.createGroup, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const name = str(payload.name) ?? "";
    ack(
      cb,
      await conversationsService.createGroup(
        userId,
        name,
        strArray(payload.memberIds),
      ),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.addMembers, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const conversationId = str(payload.conversationId);
    if (!conversationId) return ackErr(cb, "conversationId required");
    ack(
      cb,
      await conversationsService.addMembers(
        userId,
        conversationId,
        strArray(payload.userIds),
      ),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.removeMember, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const conversationId = str(payload.conversationId);
    const targetUserId = str(payload.userId);
    if (!conversationId || !targetUserId) return ackErr(cb, "Invalid payload");
    ack(
      cb,
      await conversationsService.removeMember(
        userId,
        conversationId,
        targetUserId,
      ),
      "ok",
    );
  });

  register(socket, CHAT_EVENTS.renameGroup, async (payload, cb) => {
    if (!isObj(payload)) return ackErr(cb, "Invalid payload");
    const conversationId = str(payload.conversationId);
    const name = str(payload.name) ?? "";
    if (!conversationId) return ackErr(cb, "conversationId required");
    ack(
      cb,
      await conversationsService.renameGroup(userId, conversationId, name),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.notificationRead, async (payload, cb) => {
    const id = isObj(payload) ? str(payload.id) : null;
    if (id) {
      await notifications.markRead(id, userId);
      io.to(userRoom(userId)).emit(CHAT_EVENTS.notificationReadEvent, { id });
    }
    cb?.({ ok: true });
  });

  register(socket, CHAT_EVENTS.notificationReadAll, async (_payload, cb) => {
    await notifications.markAllRead(userId);
    io.to(userRoom(userId)).emit(CHAT_EVENTS.notificationReadEvent, {
      all: true,
    });
    cb?.({ ok: true });
  });
}
