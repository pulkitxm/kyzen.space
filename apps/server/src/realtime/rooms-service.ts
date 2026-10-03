import { games, profiles } from "@kyzen/database";
import { getDefinition, hasEngine } from "@kyzen/games-core";
import {
  type GameType,
  isGameOver,
  type ServerJoinByCodeResult,
} from "@kyzen/shared/types";
import { fail, ok, type ServiceResult } from "../chat/result";
import { initialState, lobbySettings, plainSeats } from "./setup";

export async function createStandaloneGame(input: {
  userId: string;
  gameType: GameType;
  config?: unknown;
}): Promise<ServiceResult<{ code: string }>> {
  if (!hasEngine(input.gameType)) return fail("Unsupported game type", 400);

  const definition = getDefinition(input.gameType);
  const parsedConfig = definition.configSchema.safeParse(input.config ?? {});
  if (!parsedConfig.success) return fail("Invalid game config", 400);

  const profile = await profiles.getProfileByUserId(input.userId);
  if (!profile) return fail("Profile not found", 400);

  const host = {
    userId: input.userId,
    username: profile.username,
    role: definition.engine.roleForSeat(0),
  };
  const created = await games.createGame({
    gameType: input.gameType,
    status: "waiting",
    players: [host],
    gameState: definition.engine.lobby
      ? null
      : initialState(definition, plainSeats([host]), parsedConfig.data),
    config: parsedConfig.data,
    conversationId: null,
    creatorUserId: input.userId,
    seatingMode: "open",
    challengedUserId: null,
  });

  return ok({ code: created.code });
}

export async function validateJoinByCode(input: {
  userId: string;
  code: string;
}): Promise<ServerJoinByCodeResult> {
  const gameRow = await games.getGameByCode(input.code);
  if (!gameRow) return { ok: false, error: "not_found" };

  const alreadySeated = gameRow.players.some((p) => p.userId === input.userId);
  if (alreadySeated) {
    if (isGameOver(gameRow.status)) return { ok: false, error: "finished" };
    return { ok: true, code: gameRow.code };
  }

  if (isGameOver(gameRow.status)) return { ok: false, error: "finished" };
  if (gameRow.status === "active")
    return { ok: false, error: "already_started" };

  if (!hasEngine(gameRow.gameType)) return { ok: false, error: "not_found" };
  const { engine } = getDefinition(gameRow.gameType);

  const challengeReserved =
    gameRow.seatingMode === "challenge" &&
    !!gameRow.challengedUserId &&
    input.userId !== gameRow.challengedUserId;
  if (challengeReserved) return { ok: false, error: "full" };

  const reserved = engine.lobby ? lobbySettings(gameRow.config).bots.length : 0;
  if (gameRow.players.length + reserved >= engine.maxPlayers) {
    return { ok: false, error: "full" };
  }

  return { ok: true, code: gameRow.code };
}
