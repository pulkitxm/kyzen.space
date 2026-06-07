import type { CSSProperties } from "react";
import { Skeleton } from "@/components/ui";
import {
  type ChatLayout,
  EDGE_TAB_LENGTH,
  EDGE_TAB_THICKNESS,
  ICON_MARGIN,
  ICON_SIZE,
  POPOUT_MARGIN,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";

function clampX(px: number, reserve: number) {
  return `clamp(${ICON_MARGIN}px, ${px}px, calc(100vw - ${reserve}px))`;
}
function clampY(px: number, reserve: number) {
  return `clamp(${ICON_MARGIN}px, ${px}px, calc(100vh - ${reserve}px))`;
}

function GameSkeleton() {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {[
          { mine: false, w: "70%" },
          { mine: true, w: "45%" },
          { mine: false, w: "55%" },
          { mine: true, w: "40%" },
        ].map((b) => (
          <div
            key={`${b.mine}-${b.w}`}
            className={b.mine ? "flex justify-end" : "flex justify-start"}
          >
            <Skeleton
              className="h-9 rounded-2xl"
              style={{ width: b.w, maxWidth: "80%" }}
            />
          </div>
        ))}
      </div>
      <div className="border-border border-t p-3">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </>
  );
}

function popoutStyle({ popout }: ChatLayout): CSSProperties {
  return {
    width: popout.w,
    height: popout.h,
    left: `clamp(0px, ${popout.x}px, calc(100vw - ${popout.w + POPOUT_MARGIN}px))`,
    top: `clamp(0px, ${popout.y}px, calc(100vh - ${popout.h + POPOUT_MARGIN}px))`,
  };
}

function MinimizedSkeleton({ layout }: { layout: ChatLayout }) {
  const { icon, stashEdge } = layout;

  if (!stashEdge) {
    return (
      <Skeleton
        className="fixed z-50 hidden size-14 rounded-full md:block"
        style={{
          left: clampX(icon.x, ICON_SIZE + ICON_MARGIN),
          top: clampY(icon.y, ICON_SIZE + ICON_MARGIN),
        }}
      />
    );
  }

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
    <div
      aria-hidden
      style={style}
      className={cn(
        "fixed z-50 hidden animate-pulse bg-foreground/30 md:block dark:bg-surface-overlay",
        stashEdge === "left" && "rounded-r-lg",
        stashEdge === "right" && "rounded-l-lg",
        stashEdge === "top" && "rounded-b-lg",
        stashEdge === "bottom" && "rounded-t-lg",
      )}
    />
  );
}

export function PlaySkeleton({ layout }: { layout: ChatLayout }) {
  const docked = !layout.minimized && layout.mode === "mounted";
  const popout = !layout.minimized && layout.mode === "popout";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 border-border border-b md:hidden">
        <div className="flex-1 border-primary border-b-2 py-2">
          <Skeleton className="mx-auto h-4 w-12" />
        </div>
        <div className="flex-1 border-transparent border-b-2 py-2">
          <Skeleton className="mx-auto h-4 w-12" />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <GameSkeleton />

        {docked ? (
          <div
            className="hidden shrink-0 flex-col border-border border-l md:flex"
            style={{ width: layout.chatWidth }}
          >
            <ChatSkeleton />
          </div>
        ) : null}

        {popout ? (
          <div
            className="fixed z-50 hidden flex-col rounded-xl border border-border bg-background shadow-2xl md:flex"
            style={popoutStyle(layout)}
          >
            <div className="flex shrink-0 items-center justify-between rounded-t-xl border-border border-b bg-muted/40 px-3 py-2">
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-4 w-12" />
            </div>
            <ChatSkeleton />
          </div>
        ) : null}

        {layout.minimized ? <MinimizedSkeleton layout={layout} /> : null}
      </div>
    </div>
  );
}
