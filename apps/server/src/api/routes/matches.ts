import { matchChat } from "@kyzen/database";
import { isGameCode, normalizeGameCode } from "@kyzen/shared/types";
import { Hono } from "hono";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const matchesRouter = new Hono<AuthEnv>()
  .use("*", requireAuth)
  .get("/:code/messages", async (c) => {
    if (!isGameCode(c.req.param("code")))
      return c.json({ error: "Not found" }, 404);
    try {
      return c.json(
        await matchChat.readMatchChat(
          normalizeGameCode(c.req.param("code")),
          c.get("userId"),
        ),
      );
    } catch {
      return c.json({ error: "Not found" }, 404);
    }
  });
