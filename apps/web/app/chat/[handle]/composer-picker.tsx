"use client";

import type { GifJson } from "@gamelobby/chat-core";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaRegSmile } from "react-icons/fa";
import { clientFetchJson } from "@/lib/api-client";
import { gifCacheAtom, recentEmojisAtom } from "@/lib/chat/atoms";
import { type EmojiGroup, loadEmojiGroups } from "@/lib/chat/emoji";
import { cn } from "@/lib/utils";
import { BlurImage } from "./blur-image";

const MAX_RECENT = 24;
const EMOJI_STRIP = 16;
const GIF_PAGE = 24;
const NEAR_BOTTOM = 360;

const CATEGORY_LABELS: Record<string, string> = {
  people: "Smileys & People",
  smileys: "Smileys",
  nature: "Animals & Nature",
  foods: "Food & Drink",
  activity: "Activity",
  places: "Travel & Places",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

const SKELETON_HEIGHTS = [120, 88, 150, 104, 78, 140, 96, 132];

const SECTION_LABEL =
  "px-1 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide";

type Tab = "emoji" | "gif";
type EmojiCell = { id: string; native: string };

function StickyLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 bg-card px-1 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
      {children}
    </div>
  );
}

function EmojiGrid({
  emojis,
  onPick,
}: {
  emojis: EmojiCell[];
  onPick: (native: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e.id}
          type="button"
          title={e.id}
          onClick={() => onPick(e.native)}
          className="flex aspect-square items-center justify-center rounded text-2xl outline-none hover:bg-surface-overlay"
        >
          {e.native}
        </button>
      ))}
    </div>
  );
}

function GifSkeletons({ count, seed = 0 }: { count: number; seed?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders are positional
          key={`sk-${seed}-${i}`}
          className="mb-2 w-full animate-pulse rounded-lg bg-surface-overlay"
          style={{
            height: SKELETON_HEIGHTS[(seed + i) % SKELETON_HEIGHTS.length],
          }}
        />
      ))}
    </>
  );
}

function GifTile({
  gif,
  onPick,
}: {
  gif: GifJson;
  onPick: (gif: GifJson) => void;
}) {
  const ratio =
    gif.width && gif.height ? `${gif.width} / ${gif.height}` : "1 / 1";
  return (
    <button
      type="button"
      onClick={() => onPick(gif)}
      className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg outline-none transition hover:opacity-90"
    >
      <BlurImage
        src={gif.previewUrl}
        blurPreview={gif.blurPreview}
        alt={gif.title ?? "GIF"}
        aspectRatio={ratio}
        loading="lazy"
      />
    </button>
  );
}

function GifResults({
  label,
  gifs,
  error,
  showSkeletons,
  loadingMore,
  onPick,
  scrollRef,
  onScroll,
}: {
  label: string;
  gifs: GifJson[];
  error: boolean;
  showSkeletons: boolean;
  loadingMore: boolean;
  onPick: (gif: GifJson) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-2"
    >
      <div className={SECTION_LABEL}>{label}</div>
      {error ? (
        <div className="p-4 text-center text-muted-foreground text-xs">
          GIFs unavailable
        </div>
      ) : showSkeletons ? (
        <div className="columns-2 gap-2">
          <GifSkeletons count={8} />
        </div>
      ) : gifs.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-xs">
          No GIFs found
        </div>
      ) : (
        <div className="columns-2 gap-2">
          {gifs.map((g) => (
            <GifTile key={g.id} gif={g} onPick={onPick} />
          ))}
          {loadingMore ? <GifSkeletons count={4} seed={gifs.length} /> : null}
        </div>
      )}
    </div>
  );
}

export function ComposerPicker({
  onEmoji,
  onGif,
}: {
  onEmoji: (native: string) => void;
  onGif: (gif: GifJson) => void;
}) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("emoji");
  const [recents, setRecents] = useAtom(recentEmojisAtom);
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);

  const [cache, setCache] = useAtom(gifCacheAtom);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const reqIdRef = useRef(0);
  const gifScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void loadEmojiGroups().then((g) => {
      if (active) setGroups(g);
    });
    return () => {
      active = false;
    };
  }, []);

  const query = q.trim();
  const searching = query.length > 0;
  const entry = cache.get(query) ?? null;
  const gifs = entry?.gifs ?? [];

  const emojiStrip = useMemo<EmojiCell[]>(() => {
    if (!searching || !groups) return [];
    const lower = query.toLowerCase();
    const out: EmojiCell[] = [];
    for (const g of groups) {
      for (const e of g.emojis) {
        if (e.keywords.some((k) => k.includes(lower))) {
          out.push({ id: e.id, native: e.native });
          if (out.length >= EMOJI_STRIP) return out;
        }
      }
    }
    return out;
  }, [searching, query, groups]);

  const fetchGifs = useCallback(
    async (value: string, offset: number, append: boolean) => {
      const reqId = ++reqIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(false);
      }
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
        if (reqId === reqIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [setCache],
  );

  useEffect(() => {
    const value = q.trim();
    const needGifs = value.length > 0 || tab === "gif";
    if (!needGifs) return;
    if (gifScrollRef.current) gifScrollRef.current.scrollTop = 0;
    setError(false);
    if (cache.has(value)) return;
    const t = setTimeout(
      () => void fetchGifs(value, 0, false),
      value ? 300 : 0,
    );
    return () => clearTimeout(t);
  }, [q, tab, cache, fetchGifs]);

  const onGifScroll = useCallback(() => {
    const el = gifScrollRef.current;
    if (!el || loadingMore || loading) return;
    const current = cache.get(q.trim());
    if (!current || current.nextOffset == null) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM) {
      void fetchGifs(q.trim(), current.nextOffset, true);
    }
  }, [cache, q, loadingMore, loading, fetchGifs]);

  const pickEmoji = (native: string) => {
    setRecents((prev) =>
      [native, ...prev.filter((e) => e !== native)].slice(0, MAX_RECENT),
    );
    onEmoji(native);
  };

  const showSkeletons =
    !error && gifs.length === 0 && (loading || !cache.has(query));

  return (
    <div className="flex h-[32rem] w-[26rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: focus the search when the picker opens
        autoFocus
        placeholder="Search emoji & GIFs"
        className="m-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {searching ? (
        <>
          {emojiStrip.length > 0 ? (
            <div className="border-border border-b px-2 pb-2">
              <div className={SECTION_LABEL}>Emoji</div>
              <EmojiGrid emojis={emojiStrip} onPick={pickEmoji} />
            </div>
          ) : null}
          <GifResults
            label="GIFs"
            gifs={gifs}
            error={error}
            showSkeletons={showSkeletons}
            loadingMore={loadingMore}
            onPick={onGif}
            scrollRef={gifScrollRef}
            onScroll={onGifScroll}
          />
        </>
      ) : tab === "emoji" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!groups ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              Loading…
            </div>
          ) : (
            <>
              {recents.length ? (
                <div className="mb-2">
                  <StickyLabel>Frequently used</StickyLabel>
                  <EmojiGrid
                    emojis={recents.map((native) => ({ id: native, native }))}
                    onPick={pickEmoji}
                  />
                </div>
              ) : null}
              {groups.map((g) => (
                <div key={g.id} className="mb-2">
                  <StickyLabel>{CATEGORY_LABELS[g.id] ?? g.id}</StickyLabel>
                  <EmojiGrid emojis={g.emojis} onPick={pickEmoji} />
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <GifResults
          label="Trending GIFs"
          gifs={gifs}
          error={error}
          showSkeletons={showSkeletons}
          loadingMore={loadingMore}
          onPick={onGif}
          scrollRef={gifScrollRef}
          onScroll={onGifScroll}
        />
      )}

      {!searching ? (
        <div className="flex shrink-0 border-border border-t">
          <button
            type="button"
            onClick={() => setTab("emoji")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-sm outline-none transition",
              tab === "emoji"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FaRegSmile className="size-4" />
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setTab("gif")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-sm outline-none transition",
              tab === "gif"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-bold text-[11px]">GIF</span>
            GIFs
          </button>
        </div>
      ) : null}
    </div>
  );
}
