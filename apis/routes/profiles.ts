import { Hono } from "hono";
import { headers } from "next/headers";
import { ensureMongoConnected } from "@/database";
import { connectMongoose } from "@/database/mongoose";
import { Game, UserProfile } from "@/database/models";
import { getAuth } from "@/lib/auth";

const PAGE_SIZE = 20;

export const profilesRouter = new Hono()
  .get("/me", async (c) => {
    await ensureMongoConnected();
    await connectMongoose();
    const h = await headers();
    const session = await getAuth().api.getSession({ headers: h });
    if (!session?.user?.id)
      return c.json({ error: "Unauthorized" }, 401);

    const profile = await UserProfile.findOne({ userId: session.user.id }).lean();
    if (!profile) return c.json({ error: "Profile not found" }, 404);

    const games = await Game.find({
      "players.userId": session.user.id,
    })
      .sort({ updatedAt: -1 })
      .limit(PAGE_SIZE)
      .lean();

    return c.json({ profile, games });
  })
  .get("/:username", async (c) => {
    await connectMongoose();
    const username = c.req.param("username");
    if (
      ["api", "auth", "games", "profile", "account"].includes(
        username.toLowerCase(),
      )
    ) {
      return c.json({ error: "Not found" }, 404);
    }

    const profile = await UserProfile.findOne({
      username: new RegExp(`^${escapeRegex(username)}$`, "i"),
    }).lean();

    if (!profile) return c.json({ error: "Not found" }, 404);

    const games = await Game.find({
      "players.userId": profile.userId,
    })
      .sort({ updatedAt: -1 })
      .limit(PAGE_SIZE)
      .lean();

    return c.json({ profile, games });
  });

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
