"use client";

import { useEffect, useMemo, useState } from "react";
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

export function EmojiPicker({
  onSelect,
}: {
  onSelect: (native: string) => void;
}) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [q, setQ] = useState("");

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

  return (
    <div className="flex h-72 w-72 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search emoji"
        className="m-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!groups ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            No emoji found
          </div>
        ) : (
          filtered.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="px-1 py-1 text-[10px] text-muted-foreground uppercase tracking-wide">
                {CATEGORY_LABELS[g.id] ?? g.id}
              </div>
              <div className="grid grid-cols-8 gap-0.5">
                {g.emojis.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    title={e.id}
                    onClick={() => onSelect(e.native)}
                    className="flex size-8 items-center justify-center rounded text-xl hover:bg-surface-overlay"
                  >
                    {e.native}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
