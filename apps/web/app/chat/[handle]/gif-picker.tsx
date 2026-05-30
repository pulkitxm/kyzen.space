"use client";

import type { GifJson } from "@gamelobby/chat-core";
import { useEffect, useState } from "react";
import { clientFetchJson } from "@/lib/api-client";

export function GifPicker({ onSelect }: { onSelect: (gif: GifJson) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<GifJson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const value = q.trim();
    setLoading(true);
    setError(false);
    const t = setTimeout(async () => {
      try {
        const url = value
          ? `/api/gifs/search?q=${encodeURIComponent(value)}&limit=24`
          : "/api/gifs/trending?limit=24";
        const res = await clientFetchJson<{ gifs: GifJson[] }>(url);
        setGifs(res.gifs);
      } catch {
        setError(true);
        setGifs([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex h-80 w-80 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search GIFs"
        className="m-2 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            Loading…
          </div>
        ) : error ? (
          <div className="p-4 text-center text-muted-foreground text-xs">
            GIFs unavailable
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
                onClick={() => onSelect(g)}
                className="mb-2 block w-full overflow-hidden rounded-lg transition hover:opacity-90"
              >
                {/* biome-ignore lint/a11y/useAltText: alt via title */}
                <img
                  src={g.previewUrl}
                  alt={g.title ?? "GIF"}
                  loading="lazy"
                  className="w-full"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
