"use client";

import type { GifJson } from "@gamelobby/chat-core";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clientFetchJson } from "@/lib/api-client";
import { recentEmojisAtom } from "@/lib/chat/atoms";
import { type EmojiGroup, loadEmojiGroups } from "@/lib/chat/emoji";

const MAX_RECENT = 24;
const EMOJI_PER_ROW = 9;
const EMOJI_STRIP = EMOJI_PER_ROW * 2; // two rows
const GIF_PAGE = 24;
const NEAR_BOTTOM = 320;

// Shown in the strip before the user has any recents, so it's never empty.
const DEFAULT_EMOJIS = [
  "😀",
  "😂",
  "🥰",
  "😎",
  "😭",
  "👍",
  "🙏",
  "🔥",
  "🎉",
  "❤️",
  "😅",
  "😍",
  "🤔",
  "😢",
  "😡",
  "👀",
  "💯",
  "✨",
];

// Stable, varied skeleton heights so loading GIFs read as a masonry grid.
const SKELETON_HEIGHTS = [120, 88, 150, 104, 78, 140, 96, 132];

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

const SECTION_LABEL =
  "px-1 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide";

/**
 * One panel for both emojis and GIFs. A single query drives both: matching
 * emojis fill the top two rows, GIF results fill the scrollable remainder
 * (trending when idle), paging in more as you reach the bottom.
 */
export function ComposerPicker({
  onEmoji,
  onGif,
}: {
  onEmoji: (native: string) => void;
  onGif: (gif: GifJson) => void;
}) {
  const [q, setQ] = useState("");
  const [recents, setRecents] = useAtom(recentEmojisAtom);
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);

  const [gifs, setGifs] = useState<GifJson[]>([]);
  const [gifLoading, setGifLoading] = useState(true);
  const [gifError, setGifError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextOffsetRef = useRef<number | null>(0);
  const reqIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const emojiStrip = useMemo(() => {
    if (!query) {
      const base = recents.length ? recents : DEFAULT_EMOJIS;
      return base
        .slice(0, EMOJI_STRIP)
        .map((native) => ({ id: native, native }));
    }
    if (!groups) return [];
    const lower = query.toLowerCase();
    const out: { id: string; native: string }[] = [];
    for (const g of groups) {
      for (const e of g.emojis) {
        if (e.keywords.some((k) => k.includes(lower))) {
          out.push({ id: e.id, native: e.native });
          if (out.length >= EMOJI_STRIP) return out;
        }
      }
    }
    return out;
  }, [query, groups, recents]);

  const fetchGifs = useCallback(
    async (value: string, offset: number, append: boolean) => {
      const reqId = ++reqIdRef.current;
      if (append) setLoadingMore(true);
      else {
        setGifLoading(true);
        setGifError(false);
        setLoadingMore(false);
      }
      try {
        const url = value
          ? `/api/gifs/search?q=${encodeURIComponent(value)}&limit=${GIF_PAGE}&offset=${offset}`
          : `/api/gifs/trending?limit=${GIF_PAGE}&offset=${offset}`;
        const res = await clientFetchJson<{
          gifs: GifJson[];
          nextOffset: number | null;
        }>(url);
        if (reqId !== reqIdRef.current) return; // a newer request superseded us
        nextOffsetRef.current = res.nextOffset;
        setGifs((prev) => (append ? [...prev, ...res.gifs] : res.gifs));
      } catch {
        if (reqId !== reqIdRef.current) return;
        nextOffsetRef.current = null;
        if (!append) {
          setGifError(true);
          setGifs([]);
        }
      } finally {
        if (reqId === reqIdRef.current) {
          setGifLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // (Re)load the first GIF page whenever the query settles.
  useEffect(() => {
    const value = q.trim();
    nextOffsetRef.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    const t = setTimeout(() => void fetchGifs(value, 0, false), 300);
    return () => clearTimeout(t);
  }, [q, fetchGifs]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || gifLoading) return;
    if (nextOffsetRef.current == null) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM) {
      void fetchGifs(q.trim(), nextOffsetRef.current, true);
    }
  }, [fetchGifs, q, loadingMore, gifLoading]);

  const pickEmoji = (native: string) => {
    setRecents((prev) =>
      [native, ...prev.filter((e) => e !== native)].slice(0, MAX_RECENT),
    );
    onEmoji(native);
  };

  return (
    <div className="flex h-[28rem] w-[22rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // biome-ignore lint/a11y/noAutofocus: focus the search when the picker opens
        autoFocus
        placeholder="Search emoji & GIFs"
        className="m-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {emojiStrip.length > 0 ? (
        <div className="border-border border-b px-2 pb-2">
          <div className={SECTION_LABEL}>
            {query ? "Emoji" : recents.length ? "Frequently used" : "Emoji"}
          </div>
          <div className="grid grid-cols-9 gap-0.5">
            {emojiStrip.map((e) => (
              <button
                key={e.id}
                type="button"
                title={e.id}
                onClick={() => pickEmoji(e.native)}
                className="flex size-8 items-center justify-center rounded text-xl hover:bg-surface-overlay"
              >
                {e.native}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-2"
      >
        <div className={SECTION_LABEL}>{query ? "GIFs" : "Trending GIFs"}</div>
        {gifError ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            GIFs unavailable
          </div>
        ) : gifLoading ? (
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
              <button
                key={g.id}
                type="button"
                onClick={() => onGif(g)}
                className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg transition hover:opacity-90"
              >
                {/* biome-ignore lint/a11y/useAltText: alt provided via title */}
                <img
                  src={g.previewUrl}
                  alt={g.title ?? "GIF"}
                  loading="lazy"
                  className="w-full"
                  style={{
                    aspectRatio:
                      g.width && g.height
                        ? `${g.width} / ${g.height}`
                        : undefined,
                  }}
                />
              </button>
            ))}
            {loadingMore ? <GifSkeletons count={4} seed={gifs.length} /> : null}
          </div>
        )}
      </div>

      <div className="border-border border-t px-3 py-1 text-[10px] text-muted-foreground">
        Powered by Klipy
      </div>
    </div>
  );
}
