import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientCreateGameInConversationSchema,
  clientRematchSchema,
  type ServerRematchCreated,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import {
  createGameInConversation,
  rematchGame,
} from "../chat/games-in-chat-service";
import { emitToGame, emitToUser } from "./rooms";

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
        const { game, recipients } = res.value;
        const created: ServerRematchCreated = {
          newGameId: game.id,
          previousGameId: parsed.data.gameId,
        };
        if (recipients)
          for (const userId of recipients)
            emitToUser(io, userId, CHAT_EVENTS.rematchCreated, created);
        else
          emitToGame(
            io,
            parsed.data.gameId,
            CHAT_EVENTS.rematchCreated,
            created,
          );
        ack?.({ ok: true, gameId: game.id });
      })();
    },
  );
}
