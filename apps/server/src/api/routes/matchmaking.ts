import { randomUUID } from "node:crypto";
import {
  getEngine,
  hasEngine,
  type MatchDescriptor,
  TIC_TAC_TOE,
} from "@gamelobby/games-core";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import { games, profiles } from "../../db";
import { env } from "../../env";

/**
 * Match-allocation seam (plan decision #11). Returns a connection descriptor
 * so the web client never hardcodes WHERE a match is hosted. Today every match
 * is hosted on this same Socket.IO origin; a future real-time fleet only
 * changes `serverUrl` (and issues a real join token).
 */
export const matchmakingRouter = new Hono().post("/", async (c) => {
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

  // Join an existing waiting table, else open a new one.
  let match = await games.findWaitingGameToJoin(gameType, session.user.id);
  if (!match) {
    const engine = getEngine(gameType);
    match = await games.createGame({
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
  }

  const descriptor: MatchDescriptor = {
    matchId: match.id,
    serverUrl: env.publicRealtimeUrl,
    // Cookie auth is sufficient today; this is a placeholder for a future
    // dedicated-fleet join token. Not yet validated by the realtime layer.
    token: randomUUID(),
  };
  return c.json(descriptor);
});
