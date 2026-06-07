import type { MiddlewareHandler } from "hono";
import { type Auth, getAuth } from "../../auth";

type SessionResult = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>;

export type AuthEnv = {
  Variables: {
    userId: string;
    user: SessionResult["user"];
    session: SessionResult["session"];
  };
};

export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const result = await getAuth().api.getSession({ headers: c.req.raw.headers });
  if (!result?.user?.id) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", result.user.id);
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
};
