"use client";

import { type CSSProperties, useCallback, useRef } from "react";
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
  ICON_MARGIN,
  ICON_SIZE,
  type IconPos,
  type StashEdge,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD = 4;

function clampX(px: number, reserve: number) {
  return `clamp(${ICON_MARGIN}px, ${px}px, calc(100vw - ${reserve}px))`;
}
function clampY(px: number, reserve: number) {
  return `clamp(${ICON_MARGIN}px, ${px}px, calc(100vh - ${reserve}px))`;
}

function Chevron({ edge }: { edge: StashEdge }) {
  const cls = "size-4";
  if (edge === "left") return <FaChevronRight className={cls} />;
  if (edge === "right") return <FaChevronLeft className={cls} />;
  if (edge === "top") return <FaChevronDown className={cls} />;
  return <FaChevronUp className={cls} />;
}

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
  const edgeRef = useRef(stashEdge);
  edgeRef.current = stashEdge;
  const justDraggedRef = useRef(false);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const orig = { x: rect.left, y: rect.top };
      const startX = e.clientX;
      const startY = e.clientY;
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
        justDraggedRef.current = true;
        requestAnimationFrame(() => {
          justDraggedRef.current = false;
        });
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
    const centerX = icon.x + ICON_SIZE / 2;
    const centerY = icon.y + ICON_SIZE / 2;
    const vertical = stashEdge === "left" || stashEdge === "right";
    const style: CSSProperties = vertical
      ? {
          [stashEdge === "left" ? "left" : "right"]: 0,
          top: clampY(
            centerY - EDGE_TAB_LENGTH / 2,
            EDGE_TAB_LENGTH + ICON_MARGIN,
          ),
          width: EDGE_TAB_THICKNESS,
          height: EDGE_TAB_LENGTH,
        }
      : {
          [stashEdge === "top" ? "top" : "bottom"]: 0,
          left: clampX(
            centerX - EDGE_TAB_LENGTH / 2,
            EDGE_TAB_LENGTH + ICON_MARGIN,
          ),
          width: EDGE_TAB_LENGTH,
          height: EDGE_TAB_THICKNESS,
        };
    return (
      <button
        type="button"
        onClick={() => {
          if (justDraggedRef.current) return;
          onRestore();
        }}
        aria-label="Restore chat"
        style={style}
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
      style={{
        left: clampX(icon.x, ICON_SIZE + ICON_MARGIN),
        top: clampY(icon.y, ICON_SIZE + ICON_MARGIN),
        width: ICON_SIZE,
        height: ICON_SIZE,
      }}
      className="fixed z-50 flex cursor-grab items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl outline-none transition hover:bg-primary-hover active:cursor-grabbing"
    >
      <FaCommentDots className="size-6" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 font-semibold text-[11px] text-danger-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
