import "server-only";
import { cookies } from "next/headers";

/**
 * Server-side base URL for the Express API. Used by RSC/SSR and server actions.
 */
const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

/**
 * Fetch the backend from a Server Component / action, forwarding the incoming
 * request's cookies so Better Auth sees the user's session. Never cached.
 */
export async function serverFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });
}

/** As serverFetch, but returns parsed JSON, or null on any non-2xx. */
export async function serverFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await serverFetch(path, init);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
