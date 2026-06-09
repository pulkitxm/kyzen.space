"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import {
  type ChatMode,
  clampGeometry,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  type PopoutGeometry,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";
import { ChatWindowControls } from "./chat-window-controls";

export function ChatPopoutWindow({
  mode,
  minimized,
  geometry,
  chatWidth,
  mountedVisible,
  onPopOut,
  onDock,
  onMinimize,
  onClose,
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
  onClose: () => void;
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

  const nudge = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode !== "popout") return;
      const step = e.shiftKey ? 20 : 5;
      const deltas: Record<string, { dx: number; dy: number }> = {
        ArrowLeft: { dx: -step, dy: 0 },
        ArrowRight: { dx: step, dy: 0 },
        ArrowUp: { dx: 0, dy: -step },
        ArrowDown: { dx: 0, dy: step },
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      const orig = geomRef.current;
      onGeometryChange(
        clampGeometry(
          { ...orig, x: orig.x + delta.dx, y: orig.y + delta.dy },
          window.innerWidth,
          window.innerHeight,
        ),
      );
      onCommit();
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
            ? "fixed z-50 flex rounded-xl border border-border shadow-2xl"
            : cn(
                "relative border-border max-md:w-full! md:shrink-0 md:border-l",
                mountedVisible ? "flex" : "hidden md:flex",
              ),
      )}
    >
      <div
        className={cn(
          "relative shrink-0 select-none items-center rounded-t-xl border-border border-b bg-muted/40 px-3 py-2",
          isPopout ? "flex" : "hidden",
        )}
      >
        <button
          type="button"
          tabIndex={isPopout ? 0 : -1}
          aria-label="Move chat window"
          onMouseDown={startDrag}
          onKeyDown={nudge}
          className="absolute inset-0 cursor-move rounded-t-xl"
        />
        <div className="relative z-10 flex items-center">
          <ChatWindowControls
            isPopout
            onClose={onClose}
            onMinimize={onMinimize}
            onZoom={onDock}
          />
        </div>
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-medium text-muted-foreground text-xs">
          Chat
        </span>
      </div>

      {}
      <div
        className={cn(
          "absolute top-3 right-3 z-10 rounded-full bg-background/80 px-2 py-1.5 backdrop-blur",
          isPopout ? "hidden" : "hidden md:block",
        )}
      >
        <ChatWindowControls
          isPopout={false}
          onClose={onClose}
          onMinimize={onMinimize}
          onZoom={onPopOut}
        />
      </div>

      {}
      <div className="relative flex min-h-0 flex-1">{children}</div>

      {}
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
