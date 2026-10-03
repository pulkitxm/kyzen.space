"use client";

import { useAtomValue } from "jotai";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { clientFetch } from "@/lib/api-client";
import { conversationUnreadAtomFamily } from "@/lib/chat/atoms";
import {
  type ChatLayout,
  clampChatWidth,
  clampGeometry,
  type IconPos,
  type PopoutGeometry,
  persistChatLayout,
  RESIZE_HANDLE_W,
  readChatLayout,
  type StashEdge,
} from "@/lib/chat-layout";
import { startPointerDrag } from "@/lib/pointer-drag";
import { cn } from "@/lib/utils";
import { ChatFloatingIcon } from "./chat-floating-icon";
import { ChatPopoutWindow } from "./chat-popout-window";
import { GameSettingsGear } from "./game-settings-gear";

const SAVE_DEBOUNCE_MS = 600;

export type ChatTab = "game" | "chat";

export function GameChatSplit({
  conversationId,
  game,
  chat,
  tab,
  onTabChange,
  initialLayout,
  layoutTrusted,
}: {
  conversationId: string;
  game: ReactNode;
  chat: (visible: boolean, onIncoming: () => void) => ReactNode;
  tab: ChatTab;
  onTabChange: (tab: ChatTab) => void;
  initialLayout: ChatLayout;
  layoutTrusted: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<ChatLayout>(initialLayout);
  const [missed, setMissed] = useState(0);

  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback((override?: Partial<ChatLayout>) => {
    const next: ChatLayout = { ...layoutRef.current, ...override };
    persistChatLayout(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void clientFetch("/api/profiles/me/chat-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next.mode }),
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const update = useCallback(
    (patch: Partial<ChatLayout>) => {
      setLayout((p) => ({ ...p, ...patch }));
      persist(patch);
    },
    [persist],
  );

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
        setLayout({
          ...ls,
          mode: isDesktop ? ls.mode : "mounted",
          minimized: isDesktop ? ls.minimized : false,
        });
        return;
      }
    }
    if (!isDesktop) {
      setLayout((p) => (p.mode === "popout" ? { ...p, mode: "mounted" } : p));
    }
  }, [layoutTrusted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setLayout((p) => ({
        ...p,
        chatWidth: clampChatWidth(p.chatWidth, el.clientWidth),
      }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onResize = () =>
      setLayout((p) => ({
        ...p,
        popout: clampGeometry(p.popout, window.innerWidth, window.innerHeight),
      }));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onViewportChange = useEffectEvent((desktop: boolean) => {
    if (desktop) {
      onTabChange("game");
      return;
    }
    const cur = layoutRef.current;
    const patch: Partial<ChatLayout> = {};
    if (cur.mode === "popout") patch.mode = "mounted";
    if (cur.minimized) {
      patch.minimized = false;
      patch.stashEdge = null;
    }
    if (Object.keys(patch).length > 0) update(patch);
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => onViewportChange(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const startDrag = useCallback(
    (e: ReactMouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      startPointerDrag(e, {
        cursor: "col-resize",
        onMove: (ev) => {
          const rect = el.getBoundingClientRect();
          setLayout((p) => ({
            ...p,
            chatWidth: clampChatWidth(rect.right - ev.clientX, el.clientWidth),
          }));
        },
        onEnd: () => persist(),
      });
    },
    [persist],
  );

  const popOut = useCallback(() => update({ mode: "popout" }), [update]);
  const dock = useCallback(() => update({ mode: "mounted" }), [update]);

  const unread = useAtomValue(conversationUnreadAtomFamily(conversationId));

  const countIncoming = useCallback(() => {
    if (layoutRef.current.minimized) setMissed((count) => count + 1);
  }, []);

  const minimize = useCallback(() => {
    setMissed(0);
    update({ minimized: true, stashEdge: null });
  }, [update]);

  const closeToSide = useCallback(() => {
    setMissed(0);
    update({ minimized: true, stashEdge: layoutRef.current.lastStashEdge });
  }, [update]);

  const restore = useCallback(
    () => update({ minimized: false, stashEdge: null }),
    [update],
  );

  const changeStash = useCallback((edge: StashEdge | null) => {
    setLayout((p) => ({
      ...p,
      stashEdge: edge,
      lastStashEdge: edge ?? p.lastStashEdge,
    }));
  }, []);

  const setGeometry = useCallback(
    (g: PopoutGeometry) => setLayout((p) => ({ ...p, popout: g })),
    [],
  );

  const setIcon = useCallback(
    (i: IconPos) => setLayout((p) => ({ ...p, icon: i })),
    [],
  );

  const { mode, chatWidth, minimized, stashEdge, icon } = layout;
  const geometry = layout.popout;
  const isPopout = mode === "popout";
  const gearShifted = mode === "mounted" && !minimized;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {}
      <div
        role="tablist"
        aria-label="Game and chat"
        className="flex shrink-0 border-border border-b md:hidden"
      >
        {(["game", "chat"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => onTabChange(t)}
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
            isPopout || minimized ? "hidden" : "hidden md:block",
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
          onClose={closeToSide}
          onGeometryChange={setGeometry}
          onCommit={persist}
        >
          <div className="min-h-0 w-full">
            {chat(!minimized, countIncoming)}
          </div>
        </ChatPopoutWindow>

        {minimized && (
          <ChatFloatingIcon
            icon={icon}
            stashEdge={stashEdge}
            unread={unread + missed}
            onIconChange={setIcon}
            onStashChange={changeStash}
            onRestore={restore}
            onCommit={persist}
          />
        )}

        <GameSettingsGear
          shifted={gearShifted}
          offset={chatWidth + RESIZE_HANDLE_W}
        />
      </div>
    </div>
  );
}
