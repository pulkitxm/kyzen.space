import { games, profiles } from "@gamelobby/database";
import { getDefinition, hasEngine } from "@gamelobby/games-core";
import {
  type GameType,
  isGameOver,
  type ServerJoinByCodeResult,
} from "@gamelobby/shared/types";
import { fail, ok, type ServiceResult } from "../chat/result";

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

  const { engine } = definition;
  const [firstRole] = engine.roles;
  if (!firstRole) return fail("Game has no roles", 400);

  const created = await games.createGame({
    gameType: input.gameType,
    status: "waiting",
    players: [
      { userId: input.userId, username: profile.username, role: firstRole },
    ],
    gameState: engine.createInitialState([{ role: firstRole }]),
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
  if (gameRow.status === "active") return { ok: false, error: "already_started" };

  if (!hasEngine(gameRow.gameType)) return { ok: false, error: "not_found" };
  const { engine } = getDefinition(gameRow.gameType);

  const challengeReserved =
    gameRow.seatingMode === "challenge" &&
    !!gameRow.challengedUserId &&
    input.userId !== gameRow.challengedUserId;
  if (challengeReserved) return { ok: false, error: "full" };

  if (gameRow.players.length >= engine.maxPlayers) {
    return { ok: false, error: "full" };
  }

  return { ok: true, code: gameRow.code };
}
