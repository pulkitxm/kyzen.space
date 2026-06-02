import {
  CHAT_EVENTS,
  clientCreateGameInConversationSchema,
} from "@gamelobby/chat-core";
import type { Server as IOServer, Socket } from "socket.io";
import { createGameInConversation } from "../chat/games-in-chat-service";

export function attachGameChatHandlers(_io: IOServer, socket: Socket): void {
  socket.on(
    CHAT_EVENTS.createGameInConversation,
    (payload: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = clientCreateGameInConversationSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const data = parsed.data;
        const res = await createGameInConversation({
          userId: socket.data.userId,
          conversationId: data.conversationId,
          gameType: data.gameType,
          seatingMode: data.seatingMode,
          challengedUserId: data.challengedUserId ?? null,
          config: data.config,
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
