import { type Context, Hono } from "hono";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";

function redirectRelative(c: Context, pathname: string) {
  return NextResponse.redirect(new URL(pathname, c.req.url));
}

export const accountRouter = new Hono()
  .post("/sign-out", async (c) => {
    await ensureMongoConnected();
    await getAuth().api.signOut({
      headers: await headers(),
    });
    return redirectRelative(c, "/");
  })
  .post("/revoke-others", async (c) => {
    await ensureMongoConnected();
    const h = await headers();
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: h });
    if (!session?.session) return redirectRelative(c, "/auth");
    await auth.api.revokeOtherSessions({ headers: h });
    return redirectRelative(c, "/account");
  })
  .post("/revoke-session", async (c) => {
    await ensureMongoConnected();
    const h = await headers();
    const auth = getAuth();
    const current = await auth.api.getSession({ headers: h });
    if (!current?.session) return redirectRelative(c, "/auth");

    const body = await c.req.parseBody({ all: false });
    const raw = body.token;
    if (typeof raw !== "string" || raw.length === 0) {
      return redirectRelative(c, "/account");
    }

    const isCurrent = current.session.token === raw;

    if (isCurrent) {
      await auth.api.signOut({ headers: h });
      return redirectRelative(c, "/auth");
    }

    await auth.api.revokeSession({
      headers: h,
      body: { token: raw },
    });

    return redirectRelative(c, "/account");
  });
