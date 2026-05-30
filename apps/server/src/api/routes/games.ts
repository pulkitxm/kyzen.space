import { getEngine, hasEngine, TIC_TAC_TOE } from "@gamelobby/games-core";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { type GameStatus, games, profiles } from "../../db";
import type { LoggerEnv } from "../middleware/logger";
import { serializeGame, serializeMove } from "../serialize";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const gamesRouter = new Hono<LoggerEnv>()
  .get("/", async (c) => {
    const gameType = c.req.query("gameType") ?? undefined;
    const status =
      (c.req.query("status") as GameStatus | undefined) ?? undefined;
    const list = await games.listGames({ gameType, status, limit: 50 });
    return c.json({ games: list.map(serializeGame) });
  })
  .post("/", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => null);
    const gameType =
      body && typeof body.gameType === "string" ? body.gameType : TIC_TAC_TOE;
    if (!hasEngine(gameType))
      return c.json({ error: "Unsupported game type" }, 400);

    const profile = await profiles.getProfileByUserId(session.user.id);
    if (!profile) return c.json({ error: "Profile not found" }, 400);

    const engine = getEngine(gameType);
    const created = await games.createGame({
      gameType,
      status: "waiting",
      players: [
        {
          userId: session.user.id,
          username: profile.username,
          role: engine.roles[0]!,
        },
      ],
      gameState: engine.createInitialState([{ role: engine.roles[0]! }]),
    });
    c.var.log.info(
      { gameId: created.id, gameType, userId: session.user.id },
      "game created",
    );
    return c.json({ game: serializeGame(created) }, 201);
  })
  .get("/:gameId", async (c) => {
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
