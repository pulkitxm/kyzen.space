import { games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import {
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { emitToUser } from "./rooms";
import { register } from "./socket-util";

export function attachMatchmakingHandlers(io: IOServer, socket: Socket): void {
  register(socket, "game:queue_join", async (payload, cb) => {
    const parsed = clientQueueJoinSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid queue request" });
      return;
    }
    const definition = getDefinition(parsed.data.gameType);
    const config = definition.configSchema.safeParse(parsed.data.config ?? {});
    if (
      !config.success ||
      definition.engine.minPlayers !== 2 ||
      definition.engine.maxPlayers !== 2 ||
      !definition.engine.reduce
    ) {
      cb?.({ ok: false, error: "Unsupported public match configuration" });
      return;
    }
    const match = await games.joinMatchmaking({
      userId: socket.data.userId,
      owner: socket.id,
      gameType: parsed.data.gameType,
      config: config.data,
      roles: definition.engine.roles,
      gameState: definition.engine.createInitialState(
        definition.engine.roles.map((role) => ({ role })),
      ),
    });
    cb?.({ ok: true, gameId: match?.code ?? null });
    if (match) {
      for (const userId of match.userIds)
        emitToUser(io, userId, "match_found", { gameId: match.code });
    }
  });
  register(socket, "game:queue_leave", async (payload, cb) => {
    const parsed = clientQueueLeaveSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid queue request" });
      return;
    }
    await games.leaveMatchmaking(
      socket.data.userId,
      socket.id,
      parsed.data.gameType,
    );
    cb?.({ ok: true });
  });
}
