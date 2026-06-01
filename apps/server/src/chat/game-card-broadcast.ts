import { CHAT_EVENTS } from "@gamelobby/chat-core";
import type { Server as IOServer } from "socket.io";
import * as messagesRepo from "../db/repositories/messages";
import { emitToConv } from "../realtime/rooms";
import { assembleMessage } from "./assemble";

/**
 * Re-broadcast a game's chat card after its status changes (a player joins, the
 * game completes), so in-chat cards update live. The card carries its status
 * resolved server-side (see enrichGameCardMeta), so this is the single channel
 * for keeping it current — there's no separate client-side game lookup. No-op
 * if the game was not started from a conversation (no card message).
 */
export async function broadcastGameCard(
  io: IOServer,
  gameId: string,
): Promise<void> {
  const row = await messagesRepo.getGameCardByGameId(gameId);
  if (!row) return;
  const message = await assembleMessage(row);
  emitToConv(io, row.conversationId, CHAT_EVENTS.messageUpdated, { message });
}
