import type { GifJson } from "@kyzen/shared/types";
import { useAtom } from "jotai";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { clientFetchJson } from "@/lib/api-client";
import { gifCacheAtom } from "@/lib/chat/atoms";

const GIF_PAGE = 24;
const NEAR_BOTTOM = 360;

export function useGifResults(query: string, enabled: boolean) {
  const [cache, setCache] = useAtom(gifCacheAtom);
  const [request, setRequest] = useState<{
    id: number;
    append: boolean;
  } | null>(null);
  const loading = request?.append === false;
  const loadingMore = request?.append === true;
  const [error, setError] = useState(false);
  const reqIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const gifs = cache.get(query)?.gifs ?? [];

  const fetchGifs = useCallback(
    async (value: string, offset: number, append: boolean) => {
      const reqId = ++reqIdRef.current;
      setRequest({ id: reqId, append });
      if (!append) setError(false);
      try {
        const url = value
          ? `/api/gifs/search?q=${encodeURIComponent(value)}&limit=${GIF_PAGE}&offset=${offset}`
          : `/api/gifs/trending?limit=${GIF_PAGE}&offset=${offset}`;
        const res = await clientFetchJson<{
          gifs: GifJson[];
          nextOffset: number | null;
        }>(url);
        if (reqId !== reqIdRef.current) return;
        setCache((prev) => {
          const next = new Map(prev);
          const base = append ? (prev.get(value)?.gifs ?? []) : [];
          next.set(value, {
            gifs: [...base, ...res.gifs],
            nextOffset: res.nextOffset,
          });
          return next;
        });
      } catch {
        if (reqId !== reqIdRef.current) return;
        if (!append) {
          setError(true);
          setCache((prev) => {
            const next = new Map(prev);
            next.set(value, { gifs: [], nextOffset: null });
            return next;
          });
        }
      } finally {
        setRequest((current) => (current?.id === reqId ? null : current));
      }
    },
    [setCache],
  );

  const requestGifs = useEffectEvent((value: string) => {
    void fetchGifs(value, 0, false);
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset scroll to top when the query changes
  useEffect(() => {
    if (!enabled) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [query, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (cache.has(query)) return;
    const t = setTimeout(() => requestGifs(query), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, enabled, cache]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || loading) return;
    const current = cache.get(query);
    if (!current || current.nextOffset == null) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM) {
      void fetchGifs(query, current.nextOffset, true);
    }
  }, [cache, query, loadingMore, loading, fetchGifs]);

  const reset = useCallback(() => setError(false), []);

  const showSkeletons =
    !error && gifs.length === 0 && (loading || !cache.has(query));

  return {
    gifs,
    error,
    showSkeletons,
    loadingMore,
    scrollRef,
    onScroll,
    reset,
  };
}
