import { conversations, messages } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import type {
  MessageJson,
  MessageKind,
  MessageMetadata,
  SystemMeta,
} from "@kyzen/shared/types";
import { getIO } from "../realtime/io";
import { emitToConv } from "../realtime/rooms";
import { assembleMessage } from "./assemble";
import { fail, ok, type ServiceResult } from "./result";

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  kind?: MessageKind;
  body?: string | null;
  metadata?: MessageMetadata | null;
  gameId?: string | null;
  clientId?: string;
}): Promise<ServiceResult<MessageJson>> {
  const member = await conversations.isMember(
    input.conversationId,
    input.senderId,
  );
  if (!member) return fail("Not a member of this conversation", 403);

  const kind = input.kind ?? "text";
  if (kind === "text" && !input.body?.trim()) return fail("Empty message", 400);

  const row = await messages.insertMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    kind,
    body: input.body ?? null,
    metadata: input.metadata ?? null,
    gameId: input.gameId ?? null,
  });
  await conversations.touchLastMessage(
    input.conversationId,
    row.id,
    row.createdAt,
  );

  const message = await assembleMessage(row);
  const io = getIO();
  if (io) {
    emitToConv(io, input.conversationId, CHAT_EVENTS.messageNew, {
      message,
      clientId: input.clientId,
    });
  }
  return ok(message);
}

export async function sendSystemMessage(
  conversationId: string,
  meta: SystemMeta,
): Promise<MessageJson> {
  const row = await messages.insertMessage({
    conversationId,
    senderId: null,
    kind: "system",
    metadata: meta,
  });
  await conversations.touchLastMessage(conversationId, row.id, row.createdAt);
  const message = await assembleMessage(row);
  const io = getIO();
  if (io) emitToConv(io, conversationId, CHAT_EVENTS.messageNew, { message });
  return message;
}

export async function deleteMessage(
  userId: string,
  messageId: string,
): Promise<ServiceResult<MessageJson>> {
  const row = await messages.getById(messageId);
  if (!row) return fail("Message not found", 404);
  if (row.senderId !== userId) {
    return fail("You can only delete your own messages", 403);
  }
  const deleted = await messages.softDelete(messageId);
  if (!deleted) return fail("Failed to delete message", 500);

  const message = await assembleMessage(deleted);
  const io = getIO();
  if (io) {
    emitToConv(io, row.conversationId, CHAT_EVENTS.messageDeleted, {
      conversationId: row.conversationId,
      messageId,
    });
  }
  return ok(message);
}

export async function markRead(
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<ServiceResult<null>> {
  const member = await conversations.isMember(conversationId, userId);
  if (!member) return fail("Not a member of this conversation", 403);
  await conversations.markRead(conversationId, userId, messageId);
  const io = getIO();
  if (io) {
    emitToConv(io, conversationId, CHAT_EVENTS.readReceipt, {
      conversationId,
      userId,
      messageId,
    });
  }
  return ok(null);
}
