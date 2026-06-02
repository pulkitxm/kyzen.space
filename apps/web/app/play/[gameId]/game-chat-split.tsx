"use client";

import { useAtomValue } from "jotai";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { clientFetch } from "@/lib/api-client";
import { messagesAtomFamily } from "@/lib/chat/atoms";
import {
  type ChatLayout,
  type ChatMode,
  clampChatWidth,
  clampGeometry,
  type IconPos,
  type PopoutGeometry,
  persistChatLayout,
  readChatLayout,
  type StashEdge,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";
import { ChatFloatingIcon } from "./chat-floating-icon";
import { ChatPopoutWindow } from "./chat-popout-window";

const SAVE_DEBOUNCE_MS = 600;

export function GameChatSplit({
  conversationId,
  game,
  chat,
  initialLayout,
  layoutTrusted,
}: {
  conversationId: string;
  game: ReactNode;
  chat: ReactNode;
  initialLayout: ChatLayout;
  layoutTrusted: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<ChatMode>(initialLayout.mode);
  const [chatWidth, setChatWidth] = useState(initialLayout.chatWidth);
  const [geometry, setGeometry] = useState<PopoutGeometry>(
    initialLayout.popout,
  );
  const [minimized, setMinimized] = useState(initialLayout.minimized);
  const [stashEdge, setStashEdge] = useState<StashEdge | null>(
    initialLayout.stashEdge,
  );
  const [icon, setIcon] = useState<IconPos>(initialLayout.icon);
  const [tab, setTab] = useState<"game" | "chat">("game");

  const modeRef = useRef(mode);
  const widthRef = useRef(chatWidth);
  const geomRef = useRef(geometry);
  const minimizedRef = useRef(minimized);
  const stashRef = useRef(stashEdge);
  const iconRef = useRef(icon);
  modeRef.current = mode;
  widthRef.current = chatWidth;
  geomRef.current = geometry;
  minimizedRef.current = minimized;
  stashRef.current = stashEdge;
  iconRef.current = icon;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((override?: Partial<ChatLayout>) => {
    const layout: ChatLayout = {
      mode: override?.mode ?? modeRef.current,
      minimized: override?.minimized ?? minimizedRef.current,
      stashEdge:
        override?.stashEdge !== undefined
          ? override.stashEdge
          : stashRef.current,
      chatWidth: override?.chatWidth ?? widthRef.current,
      popout: override?.popout ?? geomRef.current,
      icon: override?.icon ?? iconRef.current,
    };
    persistChatLayout(layout);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void clientFetch("/api/profiles/me/chat-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: layout.mode }),
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    if (!layoutTrusted) {
      const ls = readChatLayout();
      if (ls) {
        setMode(isDesktop ? ls.mode : "mounted");
        setChatWidth(ls.chatWidth);
        setGeometry(ls.popout);
        setMinimized(isDesktop ? ls.minimized : false);
        setStashEdge(ls.stashEdge);
        setIcon(ls.icon);
        return;
      }
    }
    if (!isDesktop) setMode((m) => (m === "popout" ? "mounted" : m));
  }, [layoutTrusted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setChatWidth((w) => clampChatWidth(w, el.clientWidth));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () =>
      setGeometry((g) =>
        clampGeometry(g, window.innerWidth, window.innerHeight),
      );
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (!mq.matches && modeRef.current === "popout") {
        setMode("mounted");
        persist({ mode: "mounted" });
      }
      if (!mq.matches && minimizedRef.current) {
        setMinimized(false);
        setStashEdge(null);
        persist({ minimized: false, stashEdge: null });
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [persist]);

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

  const messages = useAtomValue(messagesAtomFamily(conversationId));
  const unreadBaseRef = useRef(messages.length);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!minimized) return;
    setUnread(Math.max(0, messages.length - unreadBaseRef.current));
  }, [messages.length, minimized]);

  const minimize = useCallback(() => {
    unreadBaseRef.current = messages.length;
    setUnread(0);
    setMinimized(true);
    persist({ minimized: true });
  }, [persist, messages.length]);

  const restore = useCallback(() => {
    setMinimized(false);
    setStashEdge(null);
    setUnread(0);
    persist({ minimized: false, stashEdge: null });
  }, [persist]);

  const changeStash = useCallback((edge: StashEdge | null) => {
    setStashEdge(edge);
  }, []);

  const isPopout = mode === "popout";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {}
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
        {}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            tab === "game" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="min-h-0 w-full">{game}</div>
        </div>

        {}
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
          minimized={minimized}
          geometry={geometry}
          chatWidth={chatWidth}
          mountedVisible={tab === "chat"}
          onPopOut={popOut}
          onDock={dock}
          onMinimize={minimize}
          onGeometryChange={setGeometry}
          onCommit={persist}
        >
          <div className="min-h-0 w-full">{chat}</div>
        </ChatPopoutWindow>

        {minimized && (
          <ChatFloatingIcon
            icon={icon}
            stashEdge={stashEdge}
            unread={unread}
            onIconChange={setIcon}
            onStashChange={changeStash}
            onRestore={restore}
            onCommit={persist}
          />
        )}
      </div>
    </div>
  );
}
