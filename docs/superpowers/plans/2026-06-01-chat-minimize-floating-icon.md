# Chat minimize-to-floating-icon + edge-stash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the play-page chat collapse to a draggable floating chat-bubble that, when dragged off a viewport edge, stashes into an Apple-PiP-style edge chevron; clicking restores the bubble, then the prior chat mode.

**Architecture:** Extend the existing `ChatLayout` model (web + server mirror) with `minimized`, `stashEdge`, and `icon` fields. Positions/sizes persist only to localStorage + cookie (device-local); the DB keeps `mode` only. A new `ChatFloatingIcon` component owns the bubble/edge-tab and its drag; `GameChatSplit` owns the state and unread count; `ChatPopoutWindow` gains an X minimize button and hides (without unmounting) the chat when minimized.

**Tech Stack:** Next.js 16 / React 19, Jotai, Tailwind v4, Hono + Drizzle (Postgres) on Bun, `bun test`, `react-icons/fa6`.

---

## File Structure

- `apps/web/lib/chat-layout.ts`: extend types/constants/defaults/normalize; add `clampIcon`, `edgeForIcon`, `stashTabPos`. (pure, unit-tested)
- `apps/web/tests/chat-layout.test.ts`: extend with tests for the new helpers/fields.
- `apps/server/src/lib/chat-layout.ts`: replace `validateChatLayout` with a `mode`-only `validateChatModePref`.
- `apps/server/src/api/routes/profiles.ts`: PUT `/me/chat-layout` stores `{ mode }` only.
- `apps/server/src/db/repositories/profiles.ts`: `updateChatLayout` takes `{ mode }`.
- `apps/server/src/db/schema.ts`: `chat_layout` jsonb `$type` narrows to `{ mode } | null` (no migration; jsonb is schemaless).
- `apps/server/tests/chat-layout.test.ts`: rewrite for `validateChatModePref`.
- `apps/web/app/play/[gameId]/chat-floating-icon.tsx`: NEW: bubble + edge-tab + drag.
- `apps/web/app/play/[gameId]/chat-popout-window.tsx`: add minimize button + `minimized` hide.
- `apps/web/app/play/[gameId]/game-chat-split.tsx`: own minimize/stash/icon state, unread, render the icon.
- `apps/web/app/play/[gameId]/play-client.tsx`: pass `conversationId`.

---

## Task 1: Extend the web ChatLayout model

**Files:**
- Modify: `apps/web/lib/chat-layout.ts`
- Test: `apps/web/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/chat-layout.test.ts` (extend the import list with `DEFAULT_ICON` and add this block):

```ts
import { DEFAULT_ICON } from "../lib/chat-layout";

describe("parseChatLayout - minimize fields", () => {
  it("defaults the new fields", () => {
    const out = parseChatLayout(JSON.stringify({ mode: "popout" }));
    expect(out.minimized).toBe(false);
    expect(out.stashEdge).toBeNull();
    expect(out.icon).toEqual(DEFAULT_ICON);
  });

  it("round-trips minimized + a valid stash edge + icon", () => {
    const out = parseChatLayout(
      JSON.stringify({
        mode: "mounted",
        minimized: true,
        stashEdge: "right",
        icon: { x: 40, y: 60 },
      }),
    );
    expect(out.minimized).toBe(true);
    expect(out.stashEdge).toBe("right");
    expect(out.icon).toEqual({ x: 40, y: 60 });
  });

  it("coerces an invalid stash edge to null", () => {
    expect(parseChatLayout(JSON.stringify({ stashEdge: "diagonal" })).stashEdge).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: FAIL - `DEFAULT_ICON` is not exported / `minimized` is undefined.

- [ ] **Step 3: Implement the model changes**

In `apps/web/lib/chat-layout.ts`:

Add types after `PopoutGeometry`:

```ts
export type StashEdge = "left" | "right" | "top" | "bottom";
export type IconPos = { x: number; y: number };
```

Change the `ChatLayout` type to:

```ts
export type ChatLayout = {
  mode: ChatMode;
  minimized: boolean;
  stashEdge: StashEdge | null;
  chatWidth: number; // chat-pane width in px; the game pane flex-fills the rest
  popout: PopoutGeometry;
  icon: IconPos; // last on-viewport floating-icon position (device-local)
};
```

Add constants near the other popout bounds:

```ts
// Floating-icon (minimized) bounds.
export const ICON_SIZE = 56;
export const ICON_MARGIN = 16;
export const EDGE_TAB_THICKNESS = 22; // how far the stash tab pokes in from the edge
export const EDGE_TAB_LENGTH = 44; // tab size along the edge

export const DEFAULT_ICON: IconPos = { x: 100000, y: 100000 }; // sentinel → clampIcon pulls to bottom-right
```

Change `DEFAULT_CHAT_LAYOUT` to:

```ts
export const DEFAULT_CHAT_LAYOUT: ChatLayout = {
  mode: "mounted",
  minimized: false,
  stashEdge: null,
  chatWidth: DEFAULT_CHAT_W,
  popout: DEFAULT_POPOUT,
  icon: DEFAULT_ICON,
};
```

Add a private edge validator above `normalizeChatLayout`:

```ts
function validStashEdge(v: unknown): StashEdge | null {
  return v === "left" || v === "right" || v === "top" || v === "bottom"
    ? v
    : null;
}
```

Replace the `return { ... }` inside `normalizeChatLayout` with:

```ts
  const ic =
    typeof r.icon === "object" && r.icon !== null
      ? (r.icon as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    minimized: r.minimized === true,
    stashEdge: validStashEdge(r.stashEdge),
    chatWidth: clampNum(r.chatWidth, MIN_CHAT, MAX_CHAT, DEFAULT_CHAT_W),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
    icon: { x: finiteOr(ic.x, DEFAULT_ICON.x), y: finiteOr(ic.y, DEFAULT_ICON.y) },
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: PASS (existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-layout.ts apps/web/tests/chat-layout.test.ts
git commit -m "feat(web): add minimized/stashEdge/icon to ChatLayout model"
```

---

## Task 2: `clampIcon` helper

**Files:**
- Modify: `apps/web/lib/chat-layout.ts`
- Test: `apps/web/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { clampIcon, ICON_MARGIN, ICON_SIZE } from "../lib/chat-layout";

describe("clampIcon", () => {
  it("pulls the sentinel to the bottom-right", () => {
    const p = clampIcon(DEFAULT_ICON, 1200, 800);
    expect(p.x).toBe(1200 - ICON_SIZE - ICON_MARGIN);
    expect(p.y).toBe(800 - ICON_SIZE - ICON_MARGIN);
  });

  it("clamps negatives to the margin", () => {
    expect(clampIcon({ x: -50, y: -50 }, 1200, 800)).toEqual({
      x: ICON_MARGIN,
      y: ICON_MARGIN,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: FAIL - `clampIcon` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/lib/chat-layout.ts`:

```ts
/** Keep the floating icon fully on-screen; resolves the bottom-right sentinel. */
export function clampIcon(icon: IconPos, vw: number, vh: number): IconPos {
  const maxX = Math.max(ICON_MARGIN, vw - ICON_SIZE - ICON_MARGIN);
  const maxY = Math.max(ICON_MARGIN, vh - ICON_SIZE - ICON_MARGIN);
  return {
    x: clampNum(icon.x, ICON_MARGIN, maxX, maxX),
    y: clampNum(icon.y, ICON_MARGIN, maxY, maxY),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-layout.ts apps/web/tests/chat-layout.test.ts
git commit -m "feat(web): add clampIcon helper"
```

---

## Task 3: `edgeForIcon` helper

**Files:**
- Modify: `apps/web/lib/chat-layout.ts`
- Test: `apps/web/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { edgeForIcon } from "../lib/chat-layout";

describe("edgeForIcon", () => {
  it("returns null when the icon center is on-screen", () => {
    expect(edgeForIcon({ x: 600, y: 400 }, 1200, 800)).toBeNull();
  });

  it("detects each edge once the center crosses it", () => {
    // ICON_SIZE 56 → half 28. center.x = x + 28.
    expect(edgeForIcon({ x: -40, y: 400 }, 1200, 800)).toBe("left"); // cx = -12
    expect(edgeForIcon({ x: 1200, y: 400 }, 1200, 800)).toBe("right"); // cx = 1228
    expect(edgeForIcon({ x: 600, y: -40 }, 1200, 800)).toBe("top"); // cy = -12
    expect(edgeForIcon({ x: 600, y: 800 }, 1200, 800)).toBe("bottom"); // cy = 828
  });

  it("on a corner, picks the edge with the larger overshoot", () => {
    // cx = -72 (left over 72), cy = -32 (top over 32) → left wins.
    expect(edgeForIcon({ x: -100, y: -60 }, 1200, 800)).toBe("left");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: FAIL - `edgeForIcon` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/lib/chat-layout.ts`:

```ts
/** Which viewport edge the icon center has crossed (largest overshoot), or null. */
export function edgeForIcon(
  icon: IconPos,
  vw: number,
  vh: number,
): StashEdge | null {
  const cx = icon.x + ICON_SIZE / 2;
  const cy = icon.y + ICON_SIZE / 2;
  const overshoot: Array<[StashEdge, number]> = [
    ["left", -cx],
    ["right", cx - vw],
    ["top", -cy],
    ["bottom", cy - vh],
  ];
  let best: StashEdge | null = null;
  let bestOver = 0;
  for (const [edge, o] of overshoot) {
    if (o > bestOver) {
      bestOver = o;
      best = edge;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-layout.ts apps/web/tests/chat-layout.test.ts
git commit -m "feat(web): add edgeForIcon helper"
```

---

## Task 4: `stashTabPos` helper

**Files:**
- Modify: `apps/web/lib/chat-layout.ts`
- Test: `apps/web/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { EDGE_TAB_THICKNESS, stashTabPos } from "../lib/chat-layout";

describe("stashTabPos", () => {
  it("pins to the correct edge coordinate", () => {
    expect(stashTabPos({ x: 600, y: 400 }, "left", 1200, 800).x).toBe(0);
    expect(stashTabPos({ x: 600, y: 400 }, "right", 1200, 800).x).toBe(
      1200 - EDGE_TAB_THICKNESS,
    );
    expect(stashTabPos({ x: 600, y: 400 }, "top", 1200, 800).y).toBe(0);
    expect(stashTabPos({ x: 600, y: 400 }, "bottom", 1200, 800).y).toBe(
      800 - EDGE_TAB_THICKNESS,
    );
  });

  it("clamps the along-edge coordinate on-screen", () => {
    const p = stashTabPos({ x: 600, y: -9999 }, "left", 1200, 800);
    expect(p.y).toBeGreaterThanOrEqual(ICON_MARGIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: FAIL - `stashTabPos` is not exported.

- [ ] **Step 3: Implement**

Add to `apps/web/lib/chat-layout.ts`:

```ts
/** Top-left coordinate for the edge-stash tab, derived from the icon's last position. */
export function stashTabPos(
  icon: IconPos,
  edge: StashEdge,
  vw: number,
  vh: number,
): IconPos {
  const cx = icon.x + ICON_SIZE / 2;
  const cy = icon.y + ICON_SIZE / 2;
  if (edge === "left" || edge === "right") {
    const y = clampNum(
      cy - EDGE_TAB_LENGTH / 2,
      ICON_MARGIN,
      Math.max(ICON_MARGIN, vh - EDGE_TAB_LENGTH - ICON_MARGIN),
      ICON_MARGIN,
    );
    return { x: edge === "left" ? 0 : vw - EDGE_TAB_THICKNESS, y };
  }
  const x = clampNum(
    cx - EDGE_TAB_LENGTH / 2,
    ICON_MARGIN,
    Math.max(ICON_MARGIN, vw - EDGE_TAB_LENGTH - ICON_MARGIN),
    ICON_MARGIN,
  );
  return { x, y: edge === "top" ? 0 : vh - EDGE_TAB_THICKNESS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-layout.ts apps/web/tests/chat-layout.test.ts
git commit -m "feat(web): add stashTabPos helper"
```

---

## Task 5: Trim server-side persistence to `mode` only

**Files:**
- Modify: `apps/server/src/lib/chat-layout.ts`
- Modify: `apps/server/src/api/routes/profiles.ts:117-134`
- Modify: `apps/server/src/db/repositories/profiles.ts:100-107`
- Modify: `apps/server/src/db/schema.ts:160`
- Test: `apps/server/tests/chat-layout.test.ts`

- [ ] **Step 1: Rewrite the failing test**

Replace the entire contents of `apps/server/tests/chat-layout.test.ts` with:

```ts
import { describe, expect, it } from "bun:test";
import { validateChatModePref } from "../src/lib/chat-layout";

describe("validateChatModePref", () => {
  it("rejects non-objects", () => {
    for (const v of [null, undefined, "x", 5, true, []])
      expect(validateChatModePref(v)).toBeNull();
  });

  it("defaults an unknown or missing mode to mounted", () => {
    expect(validateChatModePref({})).toEqual({ mode: "mounted" });
    expect(validateChatModePref({ mode: "weird" })).toEqual({ mode: "mounted" });
  });

  it("keeps a valid popout mode", () => {
    expect(validateChatModePref({ mode: "popout" })).toEqual({ mode: "popout" });
  });

  it("ignores any geometry fields (device-local, never stored)", () => {
    expect(
      validateChatModePref({ mode: "popout", chatWidth: 999, popout: { x: 1 } }),
    ).toEqual({ mode: "popout" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/chat-layout.test.ts`
Expected: FAIL - `validateChatModePref` is not exported.

- [ ] **Step 3: Implement the server changes**

In `apps/server/src/lib/chat-layout.ts`, replace the `validateChatLayout` function (and its now-unused `clampNum`/`finiteOr`/geometry constants may stay; leave them) with:

```ts
export type ChatModePref = { mode: ChatMode };

/**
 * Validate the cross-device chat preference. Only `mode` is stored server-side;
 * positions/sizes are device-local (localStorage + cookie on the web).
 */
export function validateChatModePref(input: unknown): ChatModePref | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const r = input as Record<string, unknown>;
  return { mode: r.mode === "popout" ? "popout" : "mounted" };
}
```

Delete the old `validateChatLayout` export (it is only used by the route, updated below). Leave the type/constant exports in place.

In `apps/server/src/db/schema.ts:160`, narrow the jsonb type (compile-time only, no migration needed; add the `ChatMode` import if missing):

```ts
  chatLayout: jsonb("chat_layout").$type<{ mode: ChatMode } | null>(),
```

In `apps/server/src/db/repositories/profiles.ts:100-107`, change the parameter type:

```ts
export async function updateChatLayout(
  userId: string,
  layout: { mode: ChatMode },
) {
  // ...unchanged body: .set({ chatLayout: layout, updatedAt: new Date() })...
}
```

Add a `ChatMode` import to `profiles.ts` repository if not present:
`import type { ChatMode } from "../../lib/chat-layout";`

In `apps/server/src/api/routes/profiles.ts`, update the import on line 5 and the handler (117-134):

```ts
import { validateChatModePref } from "../../lib/chat-layout";
```

```ts
    const pref = validateChatModePref(body);
    if (!pref) return c.json({ error: "Invalid layout" }, 400);

    await profiles.updateChatLayout(session.user.id, pref);
    return c.json(pref);
```

- [ ] **Step 4: Run tests + typecheck**

Run: `cd apps/server && bun test tests/chat-layout.test.ts && bun run typecheck`
Expected: PASS; typecheck clean (no remaining references to `validateChatLayout`).

> If `bun run typecheck` flags `profiles-route.test.ts` referencing the old shape, update those assertions to the `{ mode }` shape.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/chat-layout.ts apps/server/src/api/routes/profiles.ts apps/server/src/db/repositories/profiles.ts apps/server/src/db/schema.ts apps/server/tests/chat-layout.test.ts
git commit -m "feat(server): persist only chat mode (geometry is device-local)"
```

---

## Task 6: Make the web PUT send `mode` only + SSR fallback reads `mode`

**Files:**
- Modify: `apps/web/app/play/[gameId]/game-chat-split.tsx:67-82`
- Verify: `apps/web/app/play/[gameId]/page.tsx:62-68` (already runs `normalizeChatLayout` on the DB value; `{ mode }` normalizes to full defaults - no change needed, just confirm).

- [ ] **Step 1: Trim the PUT payload**

In `game-chat-split.tsx`, inside the `persist` callback, change the `clientFetch` body so only `mode` is sent to the DB (localStorage + cookie still get the full layout via `persistChatLayout`):

```ts
    persistChatLayout(layout);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void clientFetch("/api/profiles/me/chat-layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: layout.mode }),
      }).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/play/[gameId]/game-chat-split.tsx
git commit -m "feat(web): only sync chat mode to the server"
```

---

## Task 7: `ChatFloatingIcon` component

**Files:**
- Create: `apps/web/app/play/[gameId]/chat-floating-icon.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
  edgeForIcon,
  EDGE_TAB_LENGTH,
  EDGE_TAB_THICKNESS,
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
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/play/[gameId]/chat-floating-icon.tsx
git commit -m "feat(web): add ChatFloatingIcon (bubble + edge-stash tab)"
```

---

## Task 8: Minimize button + hide-when-minimized in `ChatPopoutWindow`

**Files:**
- Modify: `apps/web/app/play/[gameId]/chat-popout-window.tsx`

- [ ] **Step 1: Add props + the X buttons + hidden state**

Add `FaXmark` to the icon import:

```tsx
import { FaCompress, FaExpand, FaXmark } from "react-icons/fa6";
```

Add two props to the component signature (after `onDock`):

```tsx
  minimized: boolean;
  onMinimize: () => void;
```

In the outer `<div>` className, add a `hidden` branch when minimized. Replace the `className={cn(` block's first argument area so the wrapper hides while minimized (children stay mounted):

```tsx
      className={cn(
        "flex min-h-0 flex-col bg-background",
        minimized && "hidden",
        isPopout
          ? "fixed z-50 rounded-xl border border-border shadow-2xl"
          : cn(
              "relative border-border md:shrink-0 md:border-l max-md:!w-full",
              mountedVisible ? "flex" : "hidden md:flex",
            ),
      )}
```

In the popout header, add a minimize button before the dock button (inside the existing `<div>` that holds the `<span>Chat</span>` and dock button - wrap the two buttons in a flex span):

```tsx
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
```

For the mounted-mode overlay, wrap the existing pop-out button and a new minimize button in a cluster. Replace the single pop-out `<button>` (the one with `aria-label="Pop out chat"`) with:

```tsx
      {/* Mounted-mode overlay controls (md+ only). */}
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
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: FAIL - `GameChatSplit` does not yet pass `minimized`/`onMinimize` (fixed in Task 9). It is acceptable for this task's typecheck to fail on the missing props; verify the failure is ONLY about those two props.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/play/[gameId]/chat-popout-window.tsx
git commit -m "feat(web): add minimize button + hidden state to ChatPopoutWindow"
```

---

## Task 9: Wire minimize state, unread, and the floating icon into `GameChatSplit`

**Files:**
- Modify: `apps/web/app/play/[gameId]/game-chat-split.tsx`
- Modify: `apps/web/app/play/[gameId]/play-client.tsx:55-68`

- [ ] **Step 1: Pass `conversationId` from `play-client.tsx`**

In `play-client.tsx`, add the prop to the `<GameChatSplit ...>` element:

```tsx
    <GameChatSplit
      conversationId={conversation.id}
      initialLayout={initialLayout}
      layoutTrusted={layoutTrusted}
      game={gameNode}
      chat={ /* unchanged */ }
    />
```

- [ ] **Step 2: Extend `GameChatSplit`**

Add imports at the top of `game-chat-split.tsx`:

```tsx
import { useAtomValue } from "jotai";
import { messagesAtomFamily } from "@/lib/chat/atoms";
import { ChatFloatingIcon } from "./chat-floating-icon";
import {
  clampIcon,
  type IconPos,
  type StashEdge,
} from "@/lib/chat-layout";
```

(Merge `clampIcon`, `IconPos`, `StashEdge` into the existing `@/lib/chat-layout` import block rather than duplicating it.)

Add `conversationId` to the props type and signature:

```tsx
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
```

After the existing `geometry` state, add the new state + refs:

```tsx
  const [minimized, setMinimized] = useState(initialLayout.minimized);
  const [stashEdge, setStashEdge] = useState<StashEdge | null>(
    initialLayout.stashEdge,
  );
  const [icon, setIcon] = useState<IconPos>(initialLayout.icon);

  const minimizedRef = useRef(minimized);
  const stashRef = useRef(stashEdge);
  const iconRef = useRef(icon);
  minimizedRef.current = minimized;
  stashRef.current = stashEdge;
  iconRef.current = icon;
```

Update the `persist` callback's `layout` object to include the new fields:

```tsx
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
```

> Note: `stashEdge` is nullable, so use the `!== undefined` guard (not `??`) - `null` is a valid value the caller may set.

In the post-hydration reconciliation effect (the one that reads `readChatLayout()`), also seed the new fields when adopting localStorage:

```tsx
      if (ls) {
        setMode(isDesktop ? ls.mode : "mounted");
        setChatWidth(ls.chatWidth);
        setGeometry(ls.popout);
        setMinimized(isDesktop ? ls.minimized : false);
        setStashEdge(ls.stashEdge);
        setIcon(ls.icon);
        return;
      }
```

Add an icon re-clamp inside the existing window-resize effect (the one calling `clampGeometry`):

```tsx
  useEffect(() => {
    const onResize = () => {
      setGeometry((g) =>
        clampGeometry(g, window.innerWidth, window.innerHeight),
      );
      // A stashed tab re-pins itself via stashTabPos; only re-clamp the
      // free-floating bubble. Read stashRef so we don't nest setState calls.
      if (!stashRef.current) {
        setIcon((p) => clampIcon(p, window.innerWidth, window.innerHeight));
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
```

In the md-guard effect (`mq` change handler), also exit minimized when dropping below md:

```tsx
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
```

Add the unread counter (after the action callbacks). Snapshot the message count when minimizing; expose the delta:

```tsx
  const messages = useAtomValue(messagesAtomFamily(conversationId));
  const unreadBaseRef = useRef(messages.length);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!minimized) return;
    setUnread(Math.max(0, messages.length - unreadBaseRef.current));
  }, [messages.length, minimized]);
```

Add minimize/restore callbacks (near `popOut`/`dock`):

```tsx
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
```

Pass the new props to `<ChatPopoutWindow>`:

```tsx
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
```

Render the floating icon as a sibling, after `</ChatPopoutWindow>` but still inside the container `<div ref={containerRef}>` (it is `position: fixed`, so placement in the tree only matters for it being mounted alongside the chat). Guard on desktop via the same md logic used elsewhere - render only when `minimized`:

```tsx
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
```

- [ ] **Step 3: Typecheck + run web tests**

Run: `cd apps/web && bun run typecheck && bun test`
Expected: PASS (all chat-layout tests green; no type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/play/[gameId]/game-chat-split.tsx apps/web/app/play/[gameId]/play-client.tsx
git commit -m "feat(web): minimize chat to a draggable floating icon with edge-stash"
```

---

## Task 10: Full verification + manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Monorepo typecheck + tests + format**

Run from the repo root:

```bash
bun run typecheck && bun run test && bun run check
```

Expected: all green. If `bun run check` reports formatting, run `bun run fix` and amend the relevant commit.

- [ ] **Step 2: Manual smoke test (desktop, md+)**

Start dev (`bun run dev`), open a game with chat, and verify:

1. Mounted chat shows an **X** beside the pop-out button → click → collapses to the bottom-right **bubble**.
2. Click the **bubble** → chat returns to **mounted**.
3. Pop out, click **X** in the popout header → collapses to the bubble; click bubble → returns to **popout**.
4. Drag the bubble; push its center past the **right** edge → it morphs into a **chevron tab** on the right edge; release.
5. Click the **tab** → bubble reappears at its last on-screen position.
6. Repeat the drag for **left/top/bottom** edges.
7. While minimized, have the other player send a message → the bubble shows an **unread badge**; restore → badge clears.
8. Reload the page → the minimized/stashed state and bubble position **persist** (same device).
9. Shrink the window below the md breakpoint while minimized → chat **restores to mounted** and the bubble disappears.

- [ ] **Step 3: Cross-device sanity (optional but recommended)**

In a second browser/profile (no cookie), open the same game → layout falls back to the DB `mode` with **default** geometry (no inherited positions). Confirm no off-screen bubble.

- [ ] **Step 4: Final commit (if any formatting/fixups remain)**

```bash
git add -A
git commit -m "chore: formatting + fixups for chat minimize feature"
```

---

## Notes for the implementer

- **Why the wrapper hides instead of unmounting:** the chat subtree must keep its socket subscription and message store alive while minimized (so the unread badge works and there's no reconnect flash). This mirrors the existing "children never remount across modes" rule in `ChatPopoutWindow`.
- **`stashEdge` is nullable:** when threading it through `persist`/overrides, distinguish `null` (a real value) from `undefined` (use current), as called out in Task 9.
- **No DB migration:** `chat_layout` is a schemaless jsonb column; narrowing the `$type` is compile-time only. Existing rows holding the old full layout still parse (the web reads geometry from the cookie; the server only ever reads/writes `mode` going forward).
- **Touch drag is out of scope:** desktop mouse drag only, matching the existing popout drag.
