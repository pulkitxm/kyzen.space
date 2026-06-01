"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { clientFetch } from "@/lib/api-client";
import {
  type ChatLayout,
  type ChatMode,
  clampChatWidth,
  clampGeometry,
  DEFAULT_CHAT_LAYOUT,
  type PopoutGeometry,
  readChatLayout,
  writeChatLayout,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";
import { ChatPopoutWindow } from "./chat-popout-window";

const SAVE_DEBOUNCE_MS = 600;

/**
 * Side-by-side game + chat. The chat is the bounded right-hand pane (draggable
 * divider, md+); the game pane flex-fills. Below md it collapses to tabs. The
 * chat can pop out into a floating, draggable, resizable window; when popped out
 * the game pane goes full-width. The chat subtree is mounted once and never
 * remounts across mode toggles.
 */
export function GameChatSplit({
  game,
  chat,
  dbLayout,
}: {
  game: ReactNode;
  chat: ReactNode;
  dbLayout: ChatLayout | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<ChatMode>("mounted");
  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_LAYOUT.chatWidth);
  const [geometry, setGeometry] = useState<PopoutGeometry>(
    DEFAULT_CHAT_LAYOUT.popout,
  );
  const [tab, setTab] = useState<"game" | "chat">("game");

  const modeRef = useRef(mode);
  const widthRef = useRef(chatWidth);
  const geomRef = useRef(geometry);
  modeRef.current = mode;
  widthRef.current = chatWidth;
  geomRef.current = geometry;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `override` lets callers persist a value they just set in the same event,
  // before the matching ref has been refreshed by a re-render (e.g. the mode
  // toggles call setMode + persist synchronously).
  const persist = useCallback((override?: Partial<ChatLayout>) => {
    const layout: ChatLayout = {
      mode: override?.mode ?? modeRef.current,
      chatWidth: override?.chatWidth ?? widthRef.current,
      popout: override?.popout ?? geomRef.current,
    };
    writeChatLayout(layout);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void clientFetch("/api/profiles/me/chat-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  // Flush any pending debounced save when unmounting.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Resolve initial layout: localStorage wins, then DB, then defaults.
  // Pop-out is desktop-only — force mounted below md.
  useEffect(() => {
    const resolved = readChatLayout() ?? dbLayout ?? DEFAULT_CHAT_LAYOUT;
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    setMode(isDesktop ? resolved.mode : "mounted");
    setChatWidth(resolved.chatWidth);
    setGeometry(resolved.popout);
  }, [dbLayout]);

  // Re-clamp the chat width to keep both panes in-bounds as the container
  // resizes (makes the min/max responsive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChatWidth((w) => clampChatWidth(w, el.clientWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the floating window inside the viewport (concretizes the default
  // sentinel to bottom-right, and re-clamps on window resize).
  useEffect(() => {
    const onResize = () =>
      setGeometry((g) =>
        clampGeometry(g, window.innerWidth, window.innerHeight),
      );
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // If we drop below md while popped out, fall back to mounted.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (!mq.matches && modeRef.current === "popout") {
        setMode("mounted");
        persist({ mode: "mounted" });
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [persist]);

  // Divider drag (md+, mounted). Chat is the right-hand sized pane, so its width
  // is measured from the container's right edge.
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        setChatWidth(clampChatWidth(rect.right - ev.clientX, el.clientWidth));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        persist();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [persist],
  );

  const popOut = useCallback(() => {
    setMode("popout");
    persist({ mode: "popout" });
  }, [persist]);

  const dock = useCallback(() => {
    setMode("mounted");
    persist({ mode: "mounted" });
  }, [persist]);

  const isPopout = mode === "popout";

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

      <div ref={containerRef} className="relative flex min-h-0 flex-1">
        {/* Game pane flex-fills; the board centers via its own max width. */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            tab === "game" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="min-h-0 w-full">{game}</div>
        </div>

        {/* Draggable divider (md+, mounted only). */}
        <button
          type="button"
          aria-label="Resize"
          onMouseDown={startDrag}
          className={cn(
            "w-1.5 shrink-0 cursor-col-resize bg-border/40 outline-none transition hover:bg-primary",
            isPopout ? "hidden" : "hidden md:block",
          )}
        />

        <ChatPopoutWindow
          mode={mode}
          geometry={geometry}
          chatWidth={chatWidth}
          mountedVisible={tab === "chat"}
          onPopOut={popOut}
          onDock={dock}
          onGeometryChange={setGeometry}
          onCommit={persist}
        >
          <div className="min-h-0 w-full">{chat}</div>
        </ChatPopoutWindow>
      </div>
    </div>
  );
}
