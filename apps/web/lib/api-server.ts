import "server-only";
import { cookies } from "next/headers";

async function serverFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  const appUrl = process.env.APP_URL;
  if (process.env.VERCEL && !appUrl) {
    throw new Error("Missing APP_URL service binding for web -> app");
  }
  const baseUrl =
    appUrl ??
    process.env.API_URL ??
    `http://127.0.0.1:${process.env.PORT ?? 3000}`;
  return fetch(new URL(path, baseUrl), {
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
