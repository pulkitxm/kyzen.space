import { CHAT_EVENTS } from "@gamelobby/chat-core";
import type { Server as IOServer } from "socket.io";
import * as messagesRepo from "../db/repositories/messages";
import { emitToConv } from "../realtime/rooms";
import { assembleMessage } from "./assemble";

export async function broadcastGameCard(
  io: IOServer,
  gameId: string,
): Promise<void> {
  const row = await messagesRepo.getGameCardByGameId(gameId);
  if (!row) return;
  const message = await assembleMessage(row);
  emitToConv(io, row.conversationId, CHAT_EVENTS.messageUpdated, { message });
}
