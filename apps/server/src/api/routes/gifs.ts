import { Hono } from "hono";
import { searchGifs, trendingGifs } from "../../services/gif-provider";
import { type AuthEnv, requireAuth } from "../middleware/auth";

function clampLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "24", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 50) : 24;
}

function readOffset(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const gifsRouter = new Hono<AuthEnv>()
  .use("*", requireAuth)

  .get("/trending", async (c) => {
    const userId = c.get("userId");
    const limit = clampLimit(c.req.query("limit"));
    const offset = readOffset(c.req.query("offset"));
    try {
      const { gifs, hasNext } = await trendingGifs({
        limit,
        offset,
        customerId: userId,
      });
      return c.json({ gifs, nextOffset: hasNext ? offset + limit : null });
    } catch {
      return c.json({ error: "GIF service unavailable" }, 502);
    }
  })

  .get("/search", async (c) => {
    const userId = c.get("userId");
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ gifs: [], nextOffset: null });
    const limit = clampLimit(c.req.query("limit"));
    const offset = readOffset(c.req.query("offset"));
    try {
      const { gifs, hasNext } = await searchGifs({
        q,
        limit,
        offset,
        customerId: userId,
      });
      return c.json({ gifs, nextOffset: hasNext ? offset + limit : null });
    } catch {
      return c.json({ error: "GIF service unavailable" }, 502);
    }
  });
