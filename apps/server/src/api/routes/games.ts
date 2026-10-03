import { games } from "@kyzen/database";
import { isGameCode } from "@kyzen/shared/types";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { computeSeriesScore } from "../../chat/series";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove, serializeSeries } from "../serialize";

export const gamesRouter = new Hono<LoggerEnv>()
  .get("/:gameId/series", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (found?.publicMatch) return c.json({ error: "Not found" }, 404);
    if (!found?.seriesId) return c.json({ error: "Not found" }, 404);
    const seriesGames = await games.getSeriesGames(found.seriesId);
    const score = computeSeriesScore(seriesGames);
    return c.json(
      serializeSeries(found.seriesId, found.gameType, seriesGames, score),
    );
  })
  .get("/:gameId", async (c) => {
    const code = c.req.param("gameId");
    if (!isGameCode(code)) return c.json({ error: "Not found" }, 404);
    const found = await games.getGameByCode(code);
    if (!found) return c.json({ error: "Not found" }, 404);
    let viewerId: string | undefined;
    if (found.publicMatch) {
      const session = await getAuth().api.getSession({
        headers: c.req.raw.headers,
      });
      viewerId = session?.user.id;
      if (
        !viewerId ||
        !found.players.some((player) => player.userId === viewerId)
      )
        return c.json({ error: "Not found" }, 404);
    }
    const moves = await games.listMoves(found.id);
    return c.json({
      game: serializeGame(found, viewerId),
      moves: moves.map((m) => serializeMove(m, found.code, found)),
    });
  });
