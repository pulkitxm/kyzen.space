import { Hono } from "hono";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { ensureMongoConnected } from "@/database";
import { connectMongoose } from "@/database/mongoose";
import { Game, Move, UserProfile } from "@/database/models";
import { getAuth } from "@/lib/auth";
import { initialTicTacToeState } from "@/ws/handlers/tic-tac-toe";

const TIC_TAC_TOE = "tic-tac-toe";

export const gamesRouter = new Hono()
  .get("/", async (c) => {
    await connectMongoose();
    const gameType = c.req.query("gameType");
    const status = c.req.query("status");
    const q: Record<string, unknown> = {};
    if (gameType) q.gameType = gameType;
    if (status) q.status = status;
    const list = await Game.find(q).sort({ createdAt: -1 }).limit(50).lean();
    return c.json({ games: list });
  })
  .post("/", async (c) => {
    await ensureMongoConnected();
    await connectMongoose();
    const h = await headers();
    const session = await getAuth().api.getSession({ headers: h });
    if (!session?.user?.id)
      return c.json({ error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => null);
    const gameType =
      body && typeof body.gameType === "string" ? body.gameType : TIC_TAC_TOE;

    if (gameType !== TIC_TAC_TOE)
      return c.json({ error: "Unsupported game type" }, 400);

    const profile = await UserProfile.findOne({ userId: session.user.id });
    if (!profile) return c.json({ error: "Profile not found" }, 400);

    const game = await Game.create({
      gameType: TIC_TAC_TOE,
      status: "waiting",
      players: [
        {
          userId: session.user.id,
          username: profile.username,
          role: "X",
        },
      ],
      winner: null,
      gameState: initialTicTacToeState(),
    });

    return c.json({ game: game.toJSON() }, 201);
  })
  .get("/:gameId", async (c) => {
    await connectMongoose();
    const id = c.req.param("gameId");
    if (!mongoose.isValidObjectId(id)) return c.json({ error: "Not found" }, 404);
    const game = await Game.findById(id).lean();
    if (!game) return c.json({ error: "Not found" }, 404);
    const moves = await Move.find({ gameId: game._id })
      .sort({ moveNumber: 1 })
      .lean();
    return c.json({ game, moves });
  });
