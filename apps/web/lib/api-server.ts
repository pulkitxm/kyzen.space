import "server-only";
import { cookies } from "next/headers";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

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
