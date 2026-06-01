"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { FaCompress, FaExpand, FaXmark } from "react-icons/fa6";
import {
  type ChatMode,
  clampGeometry,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  type PopoutGeometry,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";

/**
 * Wraps the chat with mode-dependent chrome. Mounted: an in-flow column with a
 * fixed (bounded) width and a pop-out button overlaid top-right. Popout: a
 * position:fixed floating window with a drag header (dock button) and a
 * bottom-left resize handle. `children` stays at a stable position across modes
 * so the chat subtree never remounts.
 */
export function ChatPopoutWindow({
  mode,
  minimized,
  geometry,
  chatWidth,
  mountedVisible,
  onPopOut,
  onDock,
  onMinimize,
  onGeometryChange,
  onCommit,
  children,
}: {
  mode: ChatMode;
  /** When minimized the chrome hides but children stay mounted (socket alive). */
  minimized: boolean;
  geometry: PopoutGeometry;
  chatWidth: number;
  /** mounted-mode visibility (mobile tab === "chat"); ignored when popped out. */
  mountedVisible: boolean;
  onPopOut: () => void;
  onDock: () => void;
  onMinimize: () => void;
  onGeometryChange: (next: PopoutGeometry) => void;
  onCommit: () => void;
  children: ReactNode;
}) {
  const geomRef = useRef(geometry);
  geomRef.current = geometry;

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "popout") return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = geomRef.current;
      const onMove = (ev: MouseEvent) => {
        onGeometryChange(
          clampGeometry(
            {
              ...geomRef.current,
              x: orig.x + (ev.clientX - startX),
              y: orig.y + (ev.clientY - startY),
            },
            window.innerWidth,
            window.innerHeight,
          ),
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        onCommit();
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [mode, onGeometryChange, onCommit],
  );

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "popout") return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = geomRef.current;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const w = Math.max(MIN_CHAT_POPOUT_W, orig.w - dx);
        const h = Math.max(MIN_CHAT_POPOUT_H, orig.h + dy);
        const x = orig.x + (orig.w - w); // keep right edge fixed
        onGeometryChange(
          clampGeometry(
            { x, y: orig.y, w, h },
            window.innerWidth,
            window.innerHeight,
          ),
        );
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        onCommit();
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [mode, onGeometryChange, onCommit],
  );

  useEffect(() => {
    return () => {
      document.body.style.userSelect = "";
    };
  }, []);

  const isPopout = mode === "popout";
  const style = isPopout
    ? {
        left: geometry.x,
        top: geometry.y,
        width: geometry.w,
        height: geometry.h,
      }
    : { width: chatWidth };

  return (
    <div
      style={style}
      className={cn(
        // No `overflow-hidden` here: the emoji/GIF picker is an absolutely
        // positioned popover that must be allowed to spill outside the window.
        // `relative`/`fixed` are mutually exclusive position utilities — never
        // emit both, or Tailwind's source order can let `relative` win and the
        // popout `left`/`top` offsets shove it off-screen. Both modes still give
        // the absolutely-positioned children a containing block.
        "flex min-h-0 flex-col bg-background",
        minimized && "hidden",
        isPopout
          ? "fixed z-50 rounded-xl border border-border shadow-2xl"
          : cn(
              "relative border-border md:shrink-0 md:border-l max-md:!w-full",
              mountedVisible ? "flex" : "hidden md:flex",
            ),
      )}
    >
      {/* Floating-window header (drag handle + dock). Hidden when mounted. */}
      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag surface */}
      <div
        onMouseDown={startDrag}
        className={cn(
          // rounded-t-xl keeps the corners clean now that the window no longer
          // clips with overflow-hidden.
          "shrink-0 select-none cursor-move items-center justify-between rounded-t-xl border-border border-b bg-muted/40 px-3 py-2",
          isPopout ? "flex" : "hidden",
        )}
      >
        <span className="font-medium text-muted-foreground text-xs">Chat</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onMinimize}
            className="text-muted-foreground outline-none transition hover:text-foreground"
            aria-label="Minimize chat"
          >
            <FaXmark className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDock}
            className="text-muted-foreground outline-none transition hover:text-foreground"
            aria-label="Dock chat"
          >
            <FaCompress className="size-4" />
          </button>
        </div>
      </div>

      {/* Mounted-mode overlay controls (md+ only): pop out + minimize. */}
      <div
        className={cn(
          "absolute top-3 right-3 z-10 flex items-center gap-1.5",
          isPopout ? "hidden" : "hidden md:flex",
        )}
      >
        <button
          type="button"
          onClick={onPopOut}
          aria-label="Pop out chat"
          className="rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground outline-none backdrop-blur transition hover:text-foreground"
        >
          <FaExpand className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize chat"
          className="rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground outline-none backdrop-blur transition hover:text-foreground"
        >
          <FaXmark className="size-3.5" />
        </button>
      </div>

      {/* Chat content — STABLE position across modes (never remounts). `flex`
          makes the child stretch to full height so ConversationView's h-full
          resolves (otherwise the message list/composer collapse). */}
      <div className="relative flex min-h-0 flex-1">{children}</div>

      {/* Resize handle (popout only), bottom-left corner. */}
      {/** biome-ignore lint/a11y/noStaticElementInteractions: resize surface */}
      <div
        onMouseDown={startResize}
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 size-4 cursor-nesw-resize",
          isPopout ? "block" : "hidden",
        )}
      />
    </div>
  );
}
