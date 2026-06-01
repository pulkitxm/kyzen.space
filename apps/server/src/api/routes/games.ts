import { Hono } from "hono";
import { games } from "../../db";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove } from "../serialize";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Games are created via the realtime `game:create_in_conversation` path (see
// games-in-chat). This route only serves a single game for the `/play/:id` SSR
// load — the former list/create endpoints were unused and have been removed.
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
