import { Hono } from "hono";
import { headers } from "next/headers";
import { ensureMongoConnected } from "@/database";
import { connectMongoose } from "@/database/mongoose";
import { Game, UserProfile } from "@/database/models";
import { getAuth } from "@/lib/auth";
import {
  mapGamesToProfileActivityRows,
  PROFILE_ACTIVITY_PAGE_SIZE,
} from "@/lib/profile-activity-games";

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
  .get("/:username/recent-games", async (c) => {
    await connectMongoose();
    const username = c.req.param("username");
    if (
      ["api", "auth", "games", "profile", "account"].includes(
        username.toLowerCase(),
      )
    ) {
      return c.json({ error: "Not found" }, 404);
    }

    const rawOffset = Number.parseInt(c.req.query("offset") ?? "0", 10);
    const offset =
      Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const rawLimit = Number.parseInt(
      c.req.query("limit") ?? String(PROFILE_ACTIVITY_PAGE_SIZE),
      10,
    );
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(50, Math.floor(rawLimit))
        : PROFILE_ACTIVITY_PAGE_SIZE;

    const profile = await UserProfile.findOne({
      username: new RegExp(`^${escapeRegex(username)}$`, "i"),
    })
      .select({ userId: 1 })
      .lean();

    if (!profile) return c.json({ error: "Not found" }, 404);

    const docs = await Game.find({
      "players.userId": profile.userId,
    })
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit);

    return c.json({
      games: mapGamesToProfileActivityRows(page),
      hasMore,
    });
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
