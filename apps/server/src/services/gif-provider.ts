import type { GifJson } from "@gamelobby/shared/types";
import { env } from "../env";

type KlipyVariant = { url?: string; width?: number; height?: number };
type KlipySizes = Record<string, Record<string, KlipyVariant>>;
type KlipyItem = {
  id: number | string;
  title?: string;
  type?: string;
  blur_preview?: string;
  file?: KlipySizes;
};
type KlipyResponse = {
  result?: boolean;
  data?: { data?: KlipyItem[]; has_next?: boolean };
};

export type GifPage = { gifs: GifJson[]; hasNext: boolean };

export function isGifConfigured(): boolean {
  return Boolean(env.klipyApiKey);
}

function normalize(item: KlipyItem): GifJson | null {
  const file = item.file ?? {};
  const preview = file.sm?.webp ?? file.sm?.gif ?? file.md?.webp;
  const full = file.md?.gif ?? file.hd?.gif ?? file.sm?.gif;
  if (!preview?.url || !full?.url) return null;
  return {
    id: String(item.id),
    previewUrl: preview.url,
    fullUrl: full.url,
    width: full.width ?? 0,
    height: full.height ?? 0,
    title: item.title,
    blurPreview: item.blur_preview,
  };
}

async function fetchKlipy(
  path: "trending" | "search",
  params: Record<string, string>,
): Promise<GifPage> {
  const key = env.klipyApiKey;
  if (!key) throw new Error("KLIPY_API_KEY not configured");
  const url = new URL(`https://api.klipy.com/api/v1/${key}/gifs/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Klipy responded ${res.status}`);
  const json = (await res.json()) as KlipyResponse;
  if (!json.result || !Array.isArray(json.data?.data)) {
    throw new Error("Unexpected Klipy response");
  }
  const gifs = json.data.data
    .filter((i) => (i.type ?? "gif") === "gif")
    .map(normalize)
    .filter((g): g is GifJson => g !== null);
  return { gifs, hasNext: Boolean(json.data.has_next) };
}

const pageOf = (offset: number, limit: number) =>
  String(Math.floor(offset / limit) + 1);

export function trendingGifs(opts: {
  limit: number;
  offset: number;
  customerId: string;
}): Promise<GifPage> {
  return fetchKlipy("trending", {
    per_page: String(opts.limit),
    page: pageOf(opts.offset, opts.limit),
    customer_id: opts.customerId,
  });
}

export function searchGifs(opts: {
  q: string;
  limit: number;
  offset: number;
  customerId: string;
}): Promise<GifPage> {
  return fetchKlipy("search", {
    q: opts.q,
    per_page: String(opts.limit),
    page: pageOf(opts.offset, opts.limit),
    customer_id: opts.customerId,
    rating: "g",
  });
}
