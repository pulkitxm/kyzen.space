import type { Context } from "hono";
import { getAuth } from "../auth";

/** Returns the authenticated user id, or null. Mirrors the inline pattern used
 * across the existing routes (better-auth session from request cookies). */
export async function getUserId(c: Context): Promise<string | null> {
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });
  return session?.user?.id ?? null;
}

/** Safely parse a JSON body; returns null on malformed input. */
export async function readJson(
  c: Context,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
