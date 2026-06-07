import type { Context } from "hono";

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
