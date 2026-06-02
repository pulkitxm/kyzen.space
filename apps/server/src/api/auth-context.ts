import type { Context } from "hono";
import { getAuth } from "../auth";

export async function getUserId(c: Context): Promise<string | null> {
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });
  return session?.user?.id ?? null;
}

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
