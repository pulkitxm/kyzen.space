import {
  CHAT_EVENTS,
  type ClientCreateGameInConversation,
} from "@gamelobby/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import { createGameInConversation } from "../chat/games-in-chat-service";

/** Sockets-first path for "start a game in this conversation" (ack-based). */
export function attachGameChatHandlers(_io: IOServer, socket: Socket): void {
  socket.on(
    CHAT_EVENTS.createGameInConversation,
    (payload: ClientCreateGameInConversation, ack?: (res: unknown) => void) => {
      void (async () => {
        if (!payload || typeof payload.conversationId !== "string") {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const res = await createGameInConversation({
          userId: socket.data.userId,
          conversationId: payload.conversationId,
          gameType:
            typeof payload.gameType === "string" ? payload.gameType : "",
          seatingMode:
            payload.seatingMode === "open" ||
            payload.seatingMode === "challenge"
              ? payload.seatingMode
              : undefined,
          challengedUserId: payload.challengedUserId ?? null,
        });
        if (!res.ok) {
          ack?.({ ok: false, error: res.error });
          return;
        }
        ack?.({ ok: true, ...res.value });
      })();
    },
  );
}
