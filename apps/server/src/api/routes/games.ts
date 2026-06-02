import { Hono } from "hono";
import { games } from "../../db";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove } from "../serialize";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const gamesRouter = new Hono<LoggerEnv>().get("/:gameId", async (c) => {
  const id = c.req.param("gameId");
  if (!UUID_RE.test(id)) return c.json({ error: "Not found" }, 404);
  const found = await games.getGameById(id);
  if (!found) return c.json({ error: "Not found" }, 404);
  const moves = await games.listMoves(id);
  return c.json({
    game: serializeGame(found),
    moves: moves.map(serializeMove),
  });
});
