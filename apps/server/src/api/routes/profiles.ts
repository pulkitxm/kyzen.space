import { Hono } from "hono";
import { getAuth } from "../../auth";
import { games, profiles } from "../../db";

const RESERVED = new Set(["api", "auth", "games", "profile", "account"]);
const RECENT_PAGE_SIZE = 5;

function activityRow(g: {
  id: string;
  gameType: string;
  status: string;
  updatedAt: Date | null;
  createdAt: Date | null;
}) {
  const ts = g.updatedAt ?? g.createdAt ?? new Date();
  return {
    id: g.id,
    gameType: g.gameType,
    status: g.status,
    updatedAt: new Date(ts).toISOString(),
  };
}

export const profilesRouter = new Hono()
  .get("/me", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    const profile = await profiles.getProfileByUserId(session.user.id);
    if (!profile) return c.json({ error: "Profile not found" }, 404);

    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        stats: profile.stats ?? {},
        createdAt: new Date(profile.createdAt).toISOString(),
      },
      user: {
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
      },
    });
  })
  .get("/:username/recent-games", async (c) => {
    const username = c.req.param("username");
    if (RESERVED.has(username.toLowerCase()))
      return c.json({ error: "Not found" }, 404);

    const rawOffset = Number.parseInt(c.req.query("offset") ?? "0", 10);
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const rawLimit = Number.parseInt(
      c.req.query("limit") ?? String(RECENT_PAGE_SIZE),
      10,
    );
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(50, rawLimit)
        : RECENT_PAGE_SIZE;

    const profile = await profiles.getProfileByUsername(username);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const rows = await games.gamesForUser(profile.userId, {
      offset,
      limit: limit + 1,
    });
    const hasMore = rows.length > limit;
    return c.json({
      games: rows.slice(0, limit).map(activityRow),
      hasMore,
    });
  })
  .get("/:username", async (c) => {
    const username = c.req.param("username");
    if (RESERVED.has(username.toLowerCase()))
      return c.json({ error: "Not found" }, 404);

    const profile = await profiles.getProfileByUsername(username);
    if (!profile) return c.json({ error: "Not found" }, 404);

    const [rows, displayName] = await Promise.all([
      games.gamesForUser(profile.userId, { limit: 20 }),
      profiles.getDisplayName(profile.userId),
    ]);
    return c.json({
      profile: {
        userId: profile.userId,
        username: profile.username,
        displayName,
        stats: profile.stats ?? {},
        createdAt: new Date(profile.createdAt).toISOString(),
      },
      games: rows.map(activityRow),
    });
  });
