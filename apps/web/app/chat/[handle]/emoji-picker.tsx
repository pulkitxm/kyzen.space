"use client";

import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { recentEmojisAtom } from "@/lib/chat/atoms";
import { type EmojiGroup, loadEmojiGroups } from "@/lib/chat/emoji";

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

const CATEGORY_ICON: Record<string, string> = {
  people: "😀",
  smileys: "😀",
  nature: "🐶",
  foods: "🍔",
  activity: "⚽",
  places: "🚗",
  objects: "💡",
  symbols: "❤️",
  flags: "🏁",
};

const MAX_RECENT = 24;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 bg-card px-1 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
      {children}
    </div>
  );
}

function Grid({
  emojis,
  onPick,
}: {
  emojis: { id: string; native: string }[];
  onPick: (native: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e, i) => (
        <button
          key={`${e.id}-${i}`}
          type="button"
          title={e.id}
          onClick={() => onPick(e.native)}
          className="flex size-8 items-center justify-center rounded text-xl hover:bg-surface-overlay"
        >
          {e.native}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({
  onSelect,
}: {
  onSelect: (native: string) => void;
}) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [q, setQ] = useState("");
  const [recents, setRecents] = useAtom(recentEmojisAtom);
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

  const filtered = useMemo(() => {
    if (!groups) return [];
    const query = q.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        emojis: g.emojis.filter((e) =>
          e.keywords.some((k) => k.includes(query)),
        ),
      }))
      .filter((g) => g.emojis.length > 0);
  }, [groups, q]);

  const pick = (native: string) => {
    setRecents((prev) =>
      [native, ...prev.filter((e) => e !== native)].slice(0, MAX_RECENT),
    );
    onSelect(native);
  };

  const jumpTo = (id: string) => {
    document
      .getElementById(`emoji-cat-${id}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const searching = q.trim().length > 0;
  const showRecents = !searching && recents.length > 0;

  return (
    <div className="flex h-80 w-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search emoji"
        className="m-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!groups ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            Loading…
          </div>
        ) : (
          <>
            {showRecents ? (
              <div className="mb-2">
                <Label>Frequently used</Label>
                <Grid
                  emojis={recents.map((native) => ({ id: native, native }))}
                  onPick={pick}
                />
              </div>
            ) : null}
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-xs">
                No emoji found
              </div>
            ) : (
              filtered.map((g) => (
                <div key={g.id} id={`emoji-cat-${g.id}`} className="mb-2">
                  <Label>{CATEGORY_LABELS[g.id] ?? g.id}</Label>
                  <Grid emojis={g.emojis} onPick={pick} />
                </div>
              ))
            )}
          </>
        )}
      </div>
      {!searching && groups ? (
        <div className="flex items-center gap-0.5 border-border border-t px-2 py-1">
          {showRecents ? (
            <button
              type="button"
              title="Frequently used"
              onClick={() => scrollRef.current?.scrollTo({ top: 0 })}
              className="flex size-7 items-center justify-center rounded text-base hover:bg-surface-overlay"
            >
              🕘
            </button>
          ) : null}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              title={CATEGORY_LABELS[g.id] ?? g.id}
              onClick={() => jumpTo(g.id)}
              className="flex size-7 items-center justify-center rounded text-base hover:bg-surface-overlay"
            >
              {CATEGORY_ICON[g.id] ?? "⭐"}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
