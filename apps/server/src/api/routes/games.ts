import { Hono } from "hono";
import { games } from "../../db";
import { isUuid } from "../../lib/uuid";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove } from "../serialize";

export const gamesRouter = new Hono<LoggerEnv>().get("/:gameId", async (c) => {
  const id = c.req.param("gameId");
  if (!isUuid(id)) return c.json({ error: "Not found" }, 404);
  const found = await games.getGameById(id);
  if (!found) return c.json({ error: "Not found" }, 404);
  const moves = await games.listMoves(id);
  return c.json({
    game: serializeGame(found),
    moves: moves.map(serializeMove),
  });
});
