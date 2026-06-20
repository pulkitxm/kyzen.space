"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function clientFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
  });
}

export async function clientFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await clientFetch(path, init);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}
