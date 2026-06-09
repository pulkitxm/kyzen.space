import { gameTypeSchema } from "@gamelobby/shared/types";
import { Hono } from "hono";
import { getAuth } from "../../auth";
import {
  acceptInvite,
  createInvite,
  peekInvite,
} from "../../chat/invite-service";
import { readJson } from "../auth-context";
import { type AuthEnv, requireAuth } from "../middleware/auth";

export const inviteRouter = new Hono<AuthEnv>()
  .post("/", requireAuth, async (c) => {
    const userId = c.get("userId");
    const body = await readJson(c);
    const parsedType = gameTypeSchema.safeParse(body?.gameType);
    if (!parsedType.success) return c.json({ error: "Invalid game type" }, 400);
    const res = await createInvite({
      inviterUserId: userId,
      gameType: parsedType.data,
      config: body?.config,
    });
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json(res.value);
  })
  .get("/:token", async (c) => {
    const peek = await peekInvite(c.req.param("token"));
    return c.json(peek);
  })
  .post("/:token/accept", async (c) => {
    const auth = getAuth();
    const headers = c.req.raw.headers;
    let accepterUserId: string | null = null;

    const session = await auth.api.getSession({ headers });
    if (session?.user?.id) {
      accepterUserId = session.user.id;
    } else {
      const minted = await auth.api.signInAnonymous({
        headers,
        returnHeaders: true,
      });
      accepterUserId = minted.response?.user?.id ?? null;
      for (const cookie of minted.headers.getSetCookie()) {
        c.header("set-cookie", cookie, { append: true });
      }
    }

    if (!accepterUserId) {
      return c.json({ error: "Could not start a session" }, 500);
    }

    const res = await acceptInvite(c.req.param("token"), accepterUserId);
    if (!res.ok) return c.json({ error: res.error }, res.status);
    return c.json(res.value);
  });
