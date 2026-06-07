import { games } from "@gamelobby/database";
import { isGameCode } from "@gamelobby/shared/types";
import { Hono } from "hono";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove } from "../serialize";

export const gamesRouter = new Hono<LoggerEnv>().get("/:gameId", async (c) => {
  const code = c.req.param("gameId");
  if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
  const found = await games.getGameByCode(code);
  if (!found) return c.json({ error: "Not found" }, 404);
  const moves = await games.listMoves(found.id);
  return c.json({
    game: serializeGame(found),
    moves: moves.map((m) => serializeMove(m, found.code)),
  });
});
