import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientCreateGameInConversationSchema,
  clientRematchSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import {
  createGameInConversation,
  rematchGame,
} from "../chat/games-in-chat-service";
import { emitToGame } from "./rooms";

export function attachGameChatHandlers(io: IOServer, socket: Socket): void {
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

  socket.on(
    CHAT_EVENTS.rematch,
    (payload: unknown, ack?: (res: unknown) => void) => {
      void (async () => {
        const parsed = clientRematchSchema.safeParse(payload);
        if (!parsed.success) {
          ack?.({ ok: false, error: "Invalid payload" });
          return;
        }
        const res = await rematchGame({
          userId: socket.data.userId,
          gameId: parsed.data.gameId,
        });
        if (!res.ok) {
          ack?.({ ok: false, error: res.error });
          return;
        }
        emitToGame(io, parsed.data.gameId, CHAT_EVENTS.rematchCreated, {
          newGameId: res.value.game.id,
        });
        ack?.({ ok: true, gameId: res.value.game.id });
      })();
    },
  );
}
