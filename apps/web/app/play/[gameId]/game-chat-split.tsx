"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// Tic-tac-toe cells are ~size-24/28, so keep the game pane wide enough to never
// break the board; chat takes the remainder.
const MIN_GAME = 360;
const MAX_GAME = 760;
const DEFAULT_GAME = 480;
const STORAGE_KEY = "gl_game_split";

/**
 * Side-by-side game + chat with a draggable divider (md+), collapsing to tabs
 * below md. The game and chat nodes are mounted once and only shown/hidden, so
 * switching tabs never tears down the game's socket.
 */
export function GameChatSplit({
  game,
  chat,
}: {
  game: ReactNode;
  chat: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const widthRef = useRef(DEFAULT_GAME);
  const [width, setWidth] = useState(DEFAULT_GAME);
  const [tab, setTab] = useState<"game" | "chat">("game");

  useEffect(() => {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_GAME && v <= MAX_GAME) {
      widthRef.current = v;
      setWidth(v);
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.min(
        MAX_GAME,
        Math.max(MIN_GAME, e.clientX - rect.left),
      );
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(STORAGE_KEY, String(widthRef.current));
      } catch {}
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const resetWidth = () => {
    widthRef.current = DEFAULT_GAME;
    setWidth(DEFAULT_GAME);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_GAME));
    } catch {}
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Mobile tab switcher (hidden on md+). */}
      <div className="flex shrink-0 border-border border-b md:hidden">
        {(["game", "chat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 border-b-2 py-2 text-sm capitalize outline-none transition",
              tab === t
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div ref={containerRef} className="flex min-h-0 flex-1">
        <div
          style={{ width }}
          className={cn(
            "min-h-0 overflow-auto max-md:!w-full md:shrink-0",
            tab === "game" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="min-h-0 w-full">{game}</div>
        </div>

        {/* Draggable divider (md+ only); double-click resets. */}
        <button
          type="button"
          aria-label="Resize"
          onMouseDown={startDrag}
          onDoubleClick={resetWidth}
          className="hidden w-1.5 shrink-0 cursor-col-resize bg-border/40 outline-none transition hover:bg-primary md:block"
        />

        <div
          className={cn(
            "min-h-0 flex-1 border-border md:border-l",
            tab === "chat" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="min-h-0 w-full">{chat}</div>
        </div>
      </div>
    </div>
  );
}
