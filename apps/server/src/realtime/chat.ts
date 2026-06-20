import { conversations, notifications } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientAddMembersSchema,
  clientConversationRefSchema,
  clientCreateDmSchema,
  clientCreateGroupSchema,
  clientMarkReadSchema,
  clientNotificationReadSchema,
  clientRemoveMemberSchema,
  clientRenameGroupSchema,
  clientSendMessageSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import * as conversationsService from "../chat/conversations-service";
import * as messagesService from "../chat/messages-service";
import { convRoom, joinConvRoom, leaveConvRoom, userRoom } from "./rooms";
import { ack, ackErr, register } from "./socket-util";

export async function joinUserRooms(socket: Socket): Promise<void> {
  const userId = socket.data.userId;
  void socket.join(userRoom(userId));
  const ids = await conversations.getConversationIdsForUser(userId);
  for (const id of ids) void socket.join(convRoom(id));
}

export function attachChatHandlers(io: IOServer, socket: Socket): void {
  const userId = socket.data.userId;

  register(socket, CHAT_EVENTS.conversationJoin, async (payload, cb) => {
    const parsed = clientConversationRefSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "conversationId required");
    const { conversationId } = parsed.data;
    if (!(await conversations.isMember(conversationId, userId))) {
      return ackErr(cb, "Not a member of this conversation");
    }
    joinConvRoom(socket, conversationId);
    cb?.({ ok: true });
  });

  register(socket, CHAT_EVENTS.conversationLeave, async (payload, cb) => {
    const parsed = clientConversationRefSchema.safeParse(payload);
    if (parsed.success) leaveConvRoom(socket, parsed.data.conversationId);
    cb?.({ ok: true });
  });

  register(socket, CHAT_EVENTS.sendMessage, async (payload, cb) => {
    const parsed = clientSendMessageSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "Invalid payload");
    const { conversationId, kind, body, metadata, clientId } = parsed.data;
    const res = await messagesService.sendMessage({
      conversationId,
      senderId: userId,
      kind: kind === "gif" ? "gif" : "text",
      body: body ?? null,
      metadata: metadata ?? null,
      clientId,
    });
    ack(cb, res, "message");
  });

  register(socket, CHAT_EVENTS.markRead, async (payload, cb) => {
    const parsed = clientMarkReadSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "Invalid payload");
    const { conversationId, messageId } = parsed.data;
    ack(
      cb,
      await messagesService.markRead(userId, conversationId, messageId),
      "ok",
    );
  });

  register(socket, CHAT_EVENTS.createDm, async (payload, cb) => {
    const parsed = clientCreateDmSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "userId required");
    ack(
      cb,
      await conversationsService.createDm(userId, parsed.data.userId),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.createGroup, async (payload, cb) => {
    const parsed = clientCreateGroupSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "Invalid payload");
    const { name, memberIds } = parsed.data;
    ack(
      cb,
      await conversationsService.createGroup(
        userId,
        name ?? "",
        memberIds ?? [],
      ),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.addMembers, async (payload, cb) => {
    const parsed = clientAddMembersSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "conversationId required");
    const { conversationId, userIds } = parsed.data;
    ack(
      cb,
      await conversationsService.addMembers(
        userId,
        conversationId,
        userIds ?? [],
      ),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.removeMember, async (payload, cb) => {
    const parsed = clientRemoveMemberSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "Invalid payload");
    const { conversationId, userId: targetUserId } = parsed.data;
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
    const parsed = clientRenameGroupSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "conversationId required");
    const { conversationId, name } = parsed.data;
    ack(
      cb,
      await conversationsService.renameGroup(
        userId,
        conversationId,
        name ?? "",
      ),
      "conversation",
    );
  });

  register(socket, CHAT_EVENTS.notificationRead, async (payload, cb) => {
    const parsed = clientNotificationReadSchema.safeParse(payload);
    if (parsed.success) {
      await notifications.markRead(parsed.data.id, userId);
      io.to(userRoom(userId)).emit(CHAT_EVENTS.notificationReadEvent, {
        id: parsed.data.id,
      });
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
