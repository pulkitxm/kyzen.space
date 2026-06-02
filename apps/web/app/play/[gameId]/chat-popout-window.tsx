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
  minimized: boolean;
  geometry: PopoutGeometry;
  chatWidth: number;
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
        const x = orig.x + (orig.w - w);
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
        "min-h-0 flex-col bg-background",
        minimized
          ? "hidden"
          : isPopout
            ? "flex fixed z-50 rounded-xl border border-border shadow-2xl"
            : cn(
                "relative border-border md:shrink-0 md:border-l max-md:!w-full",
                mountedVisible ? "flex" : "hidden md:flex",
              ),
      )}
    >
      {}
      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag surface */}
      <div
        onMouseDown={startDrag}
        className={cn(
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

      {}
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

      {}
      <div className="relative flex min-h-0 flex-1">{children}</div>

      {}
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
