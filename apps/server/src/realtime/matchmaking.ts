import { games } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import {
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { childLogger } from "../logger";
import { ensureClock } from "./game-runner";
import { emitToUser } from "./rooms";
import { initialState, publicGroupSize, publicSeats } from "./setup";
import { rateLimiter, register } from "./socket-util";

const log = childLogger({ mod: "realtime:matchmaking" });

export function attachMatchmakingHandlers(io: IOServer, socket: Socket): void {
  const queueAllowed = rateLimiter(30, 60_000);
  socket.on("disconnect", () => {
    games.releaseMatchmakingOwner(socket.id).catch((err: unknown) => {
      log.warn({ err, userId: socket.data.userId }, "queue cleanup failed");
    });
  });
  register(socket, "game:queue_join", async (payload, cb) => {
    const parsed = clientQueueJoinSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid queue request" });
      return;
    }
    if (!queueAllowed()) {
      cb?.({ ok: false, error: "Too many searches, slow down" });
      return;
    }
    const definition = getDefinition(parsed.data.gameType);
    const config = definition.configSchema.safeParse(parsed.data.config ?? {});
    const groupSize = config.success
      ? publicGroupSize(definition, config.data)
      : null;
    if (!config.success || groupSize === null) {
      cb?.({ ok: false, error: "Unsupported public match configuration" });
      return;
    }
    const match = await games.joinMatchmaking({
      userId: socket.data.userId,
      owner: socket.id,
      gameType: parsed.data.gameType,
      config: config.data,
      seats: publicSeats(definition.engine, groupSize, config.data),
      createState: (seats) => initialState(definition, seats, config.data),
    });
    if (match) await ensureClock(io, match.code);
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
    const gameId = await games.leaveMatchmaking(
      socket.data.userId,
      socket.id,
      parsed.data.gameType,
    );
    cb?.({ ok: true, gameId });
  });
}
