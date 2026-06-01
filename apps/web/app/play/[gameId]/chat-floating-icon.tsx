"use client";

import { useCallback, useRef } from "react";
import {
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaChevronUp,
  FaCommentDots,
} from "react-icons/fa6";
import {
  clampIcon,
  EDGE_TAB_LENGTH,
  EDGE_TAB_THICKNESS,
  edgeForIcon,
  ICON_SIZE,
  type IconPos,
  type StashEdge,
  stashTabPos,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD = 4;

function Chevron({ edge }: { edge: StashEdge }) {
  const cls = "size-4";
  if (edge === "left") return <FaChevronRight className={cls} />;
  if (edge === "right") return <FaChevronLeft className={cls} />;
  if (edge === "top") return <FaChevronDown className={cls} />;
  return <FaChevronUp className={cls} />;
}

/**
 * The minimized chat: a draggable round bubble. Dragging its center past a
 * viewport edge morphs it (live) into a thin chevron tab pinned to that edge.
 * Click the bubble → restore the chat (onRestore). Click the tab → un-stash.
 */
export function ChatFloatingIcon({
  icon,
  stashEdge,
  unread,
  onIconChange,
  onStashChange,
  onRestore,
  onCommit,
}: {
  icon: IconPos;
  stashEdge: StashEdge | null;
  unread: number;
  onIconChange: (icon: IconPos) => void;
  onStashChange: (edge: StashEdge | null) => void;
  onRestore: () => void;
  onCommit: () => void;
}) {
  const iconRef = useRef(icon);
  iconRef.current = icon;
  const edgeRef = useRef(stashEdge);
  edgeRef.current = stashEdge;

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = iconRef.current;
      let moved = false;
      let lastInBounds = orig;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)
          moved = true;
        const raw = { x: orig.x + dx, y: orig.y + dy };
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const edge = edgeForIcon(raw, vw, vh);
        if (edge) {
          if (edgeRef.current !== edge) onStashChange(edge);
        } else {
          if (edgeRef.current !== null) onStashChange(null);
          lastInBounds = clampIcon(raw, vw, vh);
          onIconChange(lastInBounds);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        if (!moved) {
          onRestore();
          return;
        }
        onIconChange(lastInBounds);
        onCommit();
      };
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onIconChange, onStashChange, onRestore, onCommit],
  );

  if (stashEdge) {
    const pos = stashTabPos(
      icon,
      stashEdge,
      window.innerWidth,
      window.innerHeight,
    );
    const vertical = stashEdge === "left" || stashEdge === "right";
    return (
      <button
        type="button"
        onClick={() => {
          onStashChange(null);
          onCommit();
        }}
        aria-label="Show chat icon"
        style={{
          left: pos.x,
          top: pos.y,
          width: vertical ? EDGE_TAB_THICKNESS : EDGE_TAB_LENGTH,
          height: vertical ? EDGE_TAB_LENGTH : EDGE_TAB_THICKNESS,
        }}
        className={cn(
          "fixed z-50 flex items-center justify-center bg-primary text-primary-foreground shadow-lg outline-none transition hover:bg-primary-hover",
          stashEdge === "left" && "rounded-r-lg",
          stashEdge === "right" && "rounded-l-lg",
          stashEdge === "top" && "rounded-b-lg",
          stashEdge === "bottom" && "rounded-t-lg",
        )}
      >
        <Chevron edge={stashEdge} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onMouseDown={startDrag}
      aria-label="Restore chat"
      style={{ left: icon.x, top: icon.y, width: ICON_SIZE, height: ICON_SIZE }}
      className="fixed z-50 flex cursor-grab items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl outline-none transition hover:bg-primary-hover active:cursor-grabbing"
    >
      <FaCommentDots className="size-6" />
      {unread > 0 && (
        <span className="-right-1 -top-1 absolute flex min-w-5 items-center justify-center rounded-full bg-danger px-1 font-semibold text-[11px] text-danger-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
