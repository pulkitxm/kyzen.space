"use client";

import type { GifJson } from "@gamelobby/shared/types";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaRegFaceSmile } from "react-icons/fa6";
import { GlassPane } from "@/components/glass/glass-pane";
import { recentEmojisAtom } from "@/lib/chat/atoms";
import { type EmojiGroup, loadEmojiGroups } from "@/lib/chat/emoji";
import { useGifResults } from "@/lib/chat/use-gif-results";
import { cn } from "@/lib/utils";
import { BlurImage } from "./blur-image";

const MAX_RECENT = 24;
const EMOJI_STRIP = 16;

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
  const searchRef = useRef<HTMLInputElement>(null);

  const query = q.trim();
  const searching = query.length > 0;
  const needGifs = searching || tab === "gif";
  const {
    gifs,
    error,
    showSkeletons,
    loadingMore,
    scrollRef,
    onScroll,
    reset,
  } = useGifResults(query, needGifs);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    void loadEmojiGroups().then((g) => {
      if (active) setGroups(g);
    });
    return () => {
      active = false;
    };
  }, []);

  const haystacks = useMemo(() => {
    const map = new Map<string, string>();
    if (!groups) return map;
    for (const g of groups) {
      for (const e of g.emojis) {
        map.set(e.id, e.keywords.join(" "));
      }
    }
    return map;
  }, [groups]);

  const emojiStrip = useMemo<EmojiCell[]>(() => {
    if (!searching || !groups) return [];
    const lower = query.toLowerCase();
    const out: EmojiCell[] = [];
    for (const g of groups) {
      for (const e of g.emojis) {
        if (haystacks.get(e.id)?.toLowerCase().includes(lower)) {
          out.push({ id: e.id, native: e.native });
          if (out.length >= EMOJI_STRIP) return out;
        }
      }
    }
    return out;
  }, [searching, query, groups, haystacks]);

  const pickEmoji = (native: string) => {
    setRecents((prev) =>
      [native, ...prev.filter((e) => e !== native)].slice(0, MAX_RECENT),
    );
    onEmoji(native);
  };

  const changeQuery = (value: string) => {
    setQ(value);
    reset();
  };

  const selectTab = (next: Tab) => {
    setTab(next);
    reset();
  };

  return (
    <GlassPane className="flex h-128 w-104 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        ref={searchRef}
        value={q}
        onChange={(e) => changeQuery(e.target.value)}
        aria-label="Search emoji & GIFs"
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
            scrollRef={scrollRef}
            onScroll={onScroll}
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
          scrollRef={scrollRef}
          onScroll={onScroll}
        />
      )}

      {!searching ? (
        <div className="flex shrink-0 border-border border-t">
          <button
            type="button"
            onClick={() => selectTab("emoji")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-sm outline-none transition",
              tab === "emoji"
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FaRegFaceSmile className="size-4" />
            Emoji
          </button>
          <button
            type="button"
            onClick={() => selectTab("gif")}
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
    </GlassPane>
  );
}
