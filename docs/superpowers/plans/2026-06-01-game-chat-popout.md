# Game-chat pop-out + responsive split: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the play-page game/chat split (kill spurious scrollbars, give both panes responsive min/max widths) and add a toggleable, draggable, resizable pop-out mode for the chat, persisted to localStorage + DB (localStorage wins).

**Architecture:** A pure layout-math module (web + a mirror on the server) holds bounds + clamp helpers and is unit-tested. The chat subtree stays mounted at one stable JSX position; mode toggling only flips classNames/styles (in-flow flex child ↔ `position: fixed` floating window), so the chat never remounts and `position: fixed` resolves to the viewport (no transformed ancestors above `<main>`). Layout state lives in `game-chat-split.tsx`; it persists to `localStorage` synchronously and to `PUT /api/profiles/me/chat-layout` (debounced). The play page SSR-fetches the DB layout and passes it down; localStorage overrides it on mount.

**Tech Stack:** Next.js 16 / React 19 (web), Hono + Drizzle/Postgres (server), Bun test, Tailwind v4. No new runtime dependencies - drag/resize use the existing hand-rolled mouse-handler pattern.

---

## File structure

**Server**
- `apps/server/src/lib/chat-layout.ts` *(create)*: `ChatLayout` type, bounds constants, `validateChatLayout()` (pure, tested).
- `apps/server/src/db/schema.ts` *(modify)*: add `chatLayout` jsonb column to `userProfile`.
- `apps/server/src/db/repositories/profiles.ts` *(modify)*: add `updateChatLayout()`.
- `apps/server/src/api/routes/profiles.ts` *(modify)*: `GET /me` returns `chatLayout`; add `PUT /me/chat-layout`.
- `apps/server/drizzle/*` *(generated)*: migration adding the column.
- `apps/server/tests/chat-layout.test.ts` *(create)*: validator tests.

**Web**
- `apps/web/lib/chat-layout.ts` *(create)*: `ChatLayout` type, bounds, clamp helpers, parse/normalize, localStorage read/write (pure, tested; **no `"use client"`** so the type imports into the RSC page).
- `apps/web/app/play/[gameId]/chat-popout-window.tsx` *(create)*: presentational wrapper rendering the stable chat structure with mounted-vs-popout chrome, drag/resize handlers.
- `apps/web/app/play/[gameId]/game-chat-split.tsx` *(rewrite)*: owns mode/width/geometry state, ResizeObserver clamp, persistence, scrollbar fix, full-width game when popped out.
- `apps/web/app/play/[gameId]/play-client.tsx` *(modify)*: thread `dbLayout` prop.
- `apps/web/app/play/[gameId]/page.tsx` *(modify)*: SSR-fetch `chatLayout` from `/api/profiles/me`.
- `apps/web/tests/chat-layout.test.ts` *(create)*: clamp/parse tests.

---

## Task 1: Server layout module + validator (TDD)

**Files:**
- Create: `apps/server/src/lib/chat-layout.ts`
- Test: `apps/server/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/chat-layout.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  MAX_CHAT_POPOUT_W,
  MAX_GAME,
  MIN_GAME,
  validateChatLayout,
} from "../src/lib/chat-layout";

describe("validateChatLayout", () => {
  it("rejects non-objects", () => {
    for (const v of [null, undefined, "x", 5, true, []])
      expect(validateChatLayout(v)).toBeNull();
  });

  it("defaults a bare object to mounted mode with clamped fields", () => {
    const out = validateChatLayout({});
    expect(out).not.toBeNull();
    expect(out?.mode).toBe("mounted");
    expect(out?.dividerWidth).toBeGreaterThanOrEqual(MIN_GAME);
    expect(out?.dividerWidth).toBeLessThanOrEqual(MAX_GAME);
  });

  it("coerces an unknown mode to mounted and keeps a valid one", () => {
    expect(validateChatLayout({ mode: "weird" })?.mode).toBe("mounted");
    expect(validateChatLayout({ mode: "popout" })?.mode).toBe("popout");
  });

  it("clamps out-of-range numbers", () => {
    const out = validateChatLayout({
      mode: "popout",
      dividerWidth: 99999,
      popout: { x: 10, y: 20, w: 99999, h: -5 },
    });
    expect(out?.dividerWidth).toBe(MAX_GAME);
    expect(out?.popout.w).toBe(MAX_CHAT_POPOUT_W);
    expect(out?.popout.x).toBe(10);
  });

  it("falls back to defaults for non-finite numbers", () => {
    const out = validateChatLayout({
      dividerWidth: "abc",
      popout: { x: "nope", y: null, w: undefined, h: Number.NaN },
    });
    expect(Number.isFinite(out?.dividerWidth)).toBe(true);
    expect(Number.isFinite(out?.popout.w)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test tests/chat-layout.test.ts`
Expected: FAIL - cannot find module `../src/lib/chat-layout`.

- [ ] **Step 3: Write the module**

Create `apps/server/src/lib/chat-layout.ts`:

```ts
// Source of truth for chat-layout validation (server side). Mirror of the web
// catalog in apps/web/lib/chat-layout.ts - keep the bounds in sync.

export type ChatMode = "mounted" | "popout";

export type PopoutGeometry = { x: number; y: number; w: number; h: number };

export type ChatLayout = {
  mode: ChatMode;
  dividerWidth: number; // game-pane width in px
  popout: PopoutGeometry;
};

// Game pane bounds (px).
export const MIN_GAME = 360;
export const MAX_GAME = 760;
export const DEFAULT_GAME = 480;

// Floating-window size bounds (px).
export const MIN_CHAT_POPOUT_W = 300;
export const MAX_CHAT_POPOUT_W = 560;
export const MIN_CHAT_POPOUT_H = 320;
export const MAX_CHAT_POPOUT_H = 900;

export const DEFAULT_POPOUT: PopoutGeometry = {
  x: 100000, // sentinel; clamped to bottom-right at render time
  y: 100000,
  w: 380,
  h: 520,
};

function clampNum(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === "number" ? n : Number(n);
  const base = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, base));
}

function finiteOr(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/** Returns a normalized, clamped ChatLayout, or null if `input` is not an object. */
export function validateChatLayout(input: unknown): ChatLayout | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const r = input as Record<string, unknown>;
  const p =
    typeof r.popout === "object" && r.popout !== null
      ? (r.popout as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    dividerWidth: clampNum(r.dividerWidth, MIN_GAME, MAX_GAME, DEFAULT_GAME),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test tests/chat-layout.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/chat-layout.ts apps/server/tests/chat-layout.test.ts
git commit -m "feat(server): chat-layout validator + bounds"
```

---

## Task 2: Schema column + migration

**Files:**
- Modify: `apps/server/src/db/schema.ts` (imports near top; `userProfile` near line 145–158)

- [ ] **Step 1: Add the type import**

In `apps/server/src/db/schema.ts`, just below the existing `import { ... } from "../lib/theme";` block (around line 24–29), add:

```ts
import type { ChatLayout } from "../lib/chat-layout";
```

- [ ] **Step 2: Add the column**

In the `userProfile` table, immediately after the `colorMode` line (currently line 155), add:

```ts
  chatLayout: jsonb("chat_layout").$type<ChatLayout | null>(),
```

(`jsonb` is already imported in this file.)

- [ ] **Step 3: Generate the migration**

Run: `bun run db:generate`
Expected: a new file under `apps/server/drizzle/` adding `chat_layout` to `user_profile`. Inspect it to confirm it only adds the nullable column.

- [ ] **Step 4: Apply it (requires DB running)**

Run: `bun run db:start` then `bun run db:migrate`
Expected: migration applies cleanly. (If no DB is available in this environment, note it and let the executor apply later - but still commit the generated SQL.)

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle
git commit -m "feat(db): add chat_layout column to user_profile"
```

---

## Task 3: Repository + API route

**Files:**
- Modify: `apps/server/src/db/repositories/profiles.ts`
- Modify: `apps/server/src/api/routes/profiles.ts`

- [ ] **Step 1: Add the repo function**

In `apps/server/src/db/repositories/profiles.ts`, add this import near the existing `import type { ColorMode, ThemeId } from "../../lib/theme";` (line 3):

```ts
import type { ChatLayout } from "../../lib/chat-layout";
```

Then add, right after `updateAppearance` (after line 92):

```ts
export async function updateChatLayout(
  userId: string,
  layout: ChatLayout,
): Promise<void> {
  await db
    .update(userProfile)
    .set({ chatLayout: layout, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId));
}
```

- [ ] **Step 2: Expose chatLayout from `GET /me`**

In `apps/server/src/api/routes/profiles.ts`, in the `GET /me` handler's `profile` response object (after the `colorMode:` line, ~line 50), add:

```ts
        chatLayout: profile.chatLayout ?? null,
```

- [ ] **Step 3: Add the import + PUT route**

At the top of `apps/server/src/api/routes/profiles.ts`, add after the `getAuth` import:

```ts
import { validateChatLayout } from "../../lib/chat-layout";
```

Then add a new route immediately after the `.put("/me/appearance", ...)` handler closes (after its `return c.json(patch);` and `})`, ~line 90):

```ts
  .put("/me/chat-layout", async (c) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session?.user?.id) return c.json({ error: "Unauthorized" }, 401);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const layout = validateChatLayout(body);
    if (!layout) return c.json({ error: "Invalid layout" }, 400);

    await profiles.updateChatLayout(session.user.id, layout);
    return c.json(layout);
  })
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/repositories/profiles.ts apps/server/src/api/routes/profiles.ts
git commit -m "feat(server): persist chat layout via /me/chat-layout"
```

---

## Task 4: Web layout module (TDD)

**Files:**
- Create: `apps/web/lib/chat-layout.ts`
- Test: `apps/web/tests/chat-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/chat-layout.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  clampGameWidth,
  clampGeometry,
  DEFAULT_CHAT_LAYOUT,
  MAX_CHAT,
  MAX_GAME,
  MIN_CHAT,
  MIN_GAME,
  parseChatLayout,
  POPOUT_MARGIN,
} from "../lib/chat-layout";

describe("clampGameWidth", () => {
  it("keeps both panes within bounds on a wide container", () => {
    // container 1400 → game can be at most 760, leaving chat >= 280.
    expect(clampGameWidth(2000, 1400)).toBe(MAX_GAME);
    expect(clampGameWidth(100, 1400)).toBe(MIN_GAME);
  });

  it("never lets chat exceed MAX_CHAT (forces game wider)", () => {
    // container 1400, chat max 420 → game floor = 1400 - 420 = 980, but
    // capped by MAX_GAME 760. So hi < lo can't happen here; chat stays <= 420
    // only when container <= MAX_GAME + MAX_CHAT. Use a smaller container:
    const container = 1000; // game in [max(360,580), min(760,720)] = [580,720]
    expect(clampGameWidth(400, container)).toBe(580);
    expect(container - clampGameWidth(400, container)).toBeLessThanOrEqual(
      MAX_CHAT,
    );
  });

  it("falls back to MIN_GAME when container is too small for both mins", () => {
    expect(clampGameWidth(500, 500)).toBe(MIN_GAME);
  });
});

describe("clampGeometry", () => {
  it("pulls the default sentinel to the bottom-right of the viewport", () => {
    const g = clampGeometry(DEFAULT_CHAT_LAYOUT.popout, 1200, 800);
    expect(g.x).toBe(1200 - g.w - POPOUT_MARGIN);
    expect(g.y).toBe(800 - g.h - POPOUT_MARGIN);
  });

  it("clamps size to the viewport and keeps the window on-screen", () => {
    const g = clampGeometry({ x: -500, y: -500, w: 99999, h: 99999 }, 600, 500);
    expect(g.w).toBeLessThanOrEqual(600);
    expect(g.h).toBeLessThanOrEqual(500);
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
  });
});

describe("parseChatLayout", () => {
  it("returns defaults for null / bad JSON", () => {
    expect(parseChatLayout(null)).toEqual(DEFAULT_CHAT_LAYOUT);
    expect(parseChatLayout("{not json")).toEqual(DEFAULT_CHAT_LAYOUT);
  });

  it("coerces mode and clamps a stored width", () => {
    const out = parseChatLayout(
      JSON.stringify({ mode: "popout", dividerWidth: 5 }),
    );
    expect(out.mode).toBe("popout");
    expect(out.dividerWidth).toBe(MIN_GAME);
  });

  it("exposes sane chat bounds", () => {
    expect(MIN_CHAT).toBeLessThan(MAX_CHAT);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: FAIL - cannot find module `../lib/chat-layout`.

- [ ] **Step 3: Write the module**

Create `apps/web/lib/chat-layout.ts` (no `"use client"`, pure, importable from the RSC page for its type):

```ts
// Pure layout math + persistence helpers for the play-page game/chat split.
// Mirror of apps/server/src/lib/chat-layout.ts - keep bounds in sync.

export type ChatMode = "mounted" | "popout";

export type PopoutGeometry = { x: number; y: number; w: number; h: number };

export type ChatLayout = {
  mode: ChatMode;
  dividerWidth: number; // game-pane width in px
  popout: PopoutGeometry;
};

// Game pane bounds.
export const MIN_GAME = 360;
export const MAX_GAME = 760;
export const DEFAULT_GAME = 480;

// Chat pane (mounted) bounds - chat is deliberately kept small.
export const MIN_CHAT = 280;
export const MAX_CHAT = 420;

// Floating-window size bounds.
export const MIN_CHAT_POPOUT_W = 300;
export const MAX_CHAT_POPOUT_W = 560;
export const MIN_CHAT_POPOUT_H = 320;
export const MAX_CHAT_POPOUT_H = 900;
export const POPOUT_MARGIN = 16;

export const CHAT_LAYOUT_KEY = "gl_chat_layout";

export const DEFAULT_POPOUT: PopoutGeometry = {
  x: 100000, // sentinel; clampGeometry pulls it to bottom-right
  y: 100000,
  w: 380,
  h: 520,
};

export const DEFAULT_CHAT_LAYOUT: ChatLayout = {
  mode: "mounted",
  dividerWidth: DEFAULT_GAME,
  popout: DEFAULT_POPOUT,
};

function clampNum(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === "number" ? n : Number(n);
  const base = Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, base));
}

function finiteOr(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Clamp the game-pane width so BOTH panes respect their min/max for the given
 * container width. Responsive: callers re-run this on container resize.
 */
export function clampGameWidth(width: number, containerW: number): number {
  const lo = Math.max(MIN_GAME, containerW - MAX_CHAT);
  const hi = Math.min(MAX_GAME, containerW - MIN_CHAT);
  if (hi < lo) return MIN_GAME; // container too small for both mins
  return clampNum(width, lo, hi, DEFAULT_GAME);
}

/** Clamp a floating-window geometry to the viewport (size + on-screen position). */
export function clampGeometry(
  geo: PopoutGeometry,
  vw: number,
  vh: number,
): PopoutGeometry {
  const w = clampNum(geo.w, MIN_CHAT_POPOUT_W, Math.max(MIN_CHAT_POPOUT_W, Math.min(MAX_CHAT_POPOUT_W, vw)), DEFAULT_POPOUT.w);
  const h = clampNum(geo.h, MIN_CHAT_POPOUT_H, Math.max(MIN_CHAT_POPOUT_H, Math.min(MAX_CHAT_POPOUT_H, vh)), DEFAULT_POPOUT.h);
  const maxX = Math.max(0, vw - w - POPOUT_MARGIN);
  const maxY = Math.max(0, vh - h - POPOUT_MARGIN);
  return {
    w,
    h,
    x: clampNum(geo.x, 0, maxX, maxX),
    y: clampNum(geo.y, 0, maxY, maxY),
  };
}

export function normalizeChatLayout(o: unknown): ChatLayout {
  if (typeof o !== "object" || o === null || Array.isArray(o))
    return DEFAULT_CHAT_LAYOUT;
  const r = o as Record<string, unknown>;
  const p =
    typeof r.popout === "object" && r.popout !== null
      ? (r.popout as Record<string, unknown>)
      : {};
  return {
    mode: r.mode === "popout" ? "popout" : "mounted",
    dividerWidth: clampNum(r.dividerWidth, MIN_GAME, MAX_GAME, DEFAULT_GAME),
    popout: {
      x: finiteOr(p.x, DEFAULT_POPOUT.x),
      y: finiteOr(p.y, DEFAULT_POPOUT.y),
      w: clampNum(p.w, MIN_CHAT_POPOUT_W, MAX_CHAT_POPOUT_W, DEFAULT_POPOUT.w),
      h: clampNum(p.h, MIN_CHAT_POPOUT_H, MAX_CHAT_POPOUT_H, DEFAULT_POPOUT.h),
    },
  };
}

export function parseChatLayout(raw: string | null | undefined): ChatLayout {
  if (!raw) return DEFAULT_CHAT_LAYOUT;
  try {
    return normalizeChatLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_CHAT_LAYOUT;
  }
}

export function readChatLayout(): ChatLayout | null {
  try {
    const raw = localStorage.getItem(CHAT_LAYOUT_KEY);
    return raw ? parseChatLayout(raw) : null;
  } catch {
    return null;
  }
}

export function writeChatLayout(layout: ChatLayout): void {
  try {
    localStorage.setItem(CHAT_LAYOUT_KEY, JSON.stringify(layout));
  } catch {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test tests/chat-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/chat-layout.ts apps/web/tests/chat-layout.test.ts
git commit -m "feat(web): chat-layout clamp helpers + persistence"
```

---

## Task 5: ChatPopoutWindow component

**Files:**
- Create: `apps/web/app/play/[gameId]/chat-popout-window.tsx`

This is a presentational wrapper. **Invariant: `{children}` (the chat) sits at one fixed JSX position in BOTH modes, so toggling `mode` never remounts it.** Only classNames/styles and chrome visibility change.

- [ ] **Step 1: Create the component**

Create `apps/web/app/play/[gameId]/chat-popout-window.tsx`:

```tsx
"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { FaExpand, FaXmark } from "react-icons/fa6";
import {
  type ChatMode,
  clampGeometry,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  type PopoutGeometry,
} from "@/lib/chat-layout";
import { cn } from "@/lib/utils";

/**
 * Wraps the chat with mode-dependent chrome. In "mounted" mode it is an in-flow
 * flex column (with a pop-out button overlaid top-right). In "popout" mode it is
 * a position:fixed floating window with a drag header (dock button) and a
 * bottom-left resize handle. The children stay at a stable position across modes
 * so the chat subtree never remounts.
 */
export function ChatPopoutWindow({
  mode,
  geometry,
  mountedVisible,
  onPopOut,
  onDock,
  onGeometryChange,
  onCommit,
  children,
}: {
  mode: ChatMode;
  geometry: PopoutGeometry;
  /** mounted-mode visibility (mobile tab === "chat"); ignored when popped out. */
  mountedVisible: boolean;
  onPopOut: () => void;
  onDock: () => void;
  onGeometryChange: (next: PopoutGeometry) => void;
  onCommit: () => void;
  children: ReactNode;
}) {
  const geomRef = useRef(geometry);
  geomRef.current = geometry;

  // Drag the window by its header.
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "popout") return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = geomRef.current;
      const onMove = (ev: MouseEvent) => {
        const next = clampGeometry(
          {
            ...geomRef.current,
            x: orig.x + (ev.clientX - startX),
            y: orig.y + (ev.clientY - startY),
          },
          window.innerWidth,
          window.innerHeight,
        );
        onGeometryChange(next);
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

  // Resize from the bottom-left corner (window is pinned bottom-right by
  // default, so the bottom-left corner is the natural free handle).
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
        const next = clampGeometry(
          { x, y: orig.y, w, h },
          window.innerWidth,
          window.innerHeight,
        );
        onGeometryChange(next);
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

  // Safety: drop listeners if unmounted mid-drag.
  useEffect(() => {
    return () => {
      document.body.style.userSelect = "";
    };
  }, []);

  const isPopout = mode === "popout";
  const fixedStyle = isPopout
    ? {
        left: geometry.x,
        top: geometry.y,
        width: geometry.w,
        height: geometry.h,
      }
    : undefined;

  return (
    <div
      style={fixedStyle}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-background",
        isPopout
          ? "fixed z-50 rounded-xl border border-border shadow-2xl"
          : cn(
              "flex-1 border-border md:border-l",
              mountedVisible ? "flex" : "hidden md:flex",
            ),
      )}
    >
      {/* Floating-window header (drag handle + dock). Hidden when mounted. */}
      {/** biome-ignore lint/a11y/noStaticElementInteractions: drag surface */}
      <div
        onMouseDown={startDrag}
        className={cn(
          "shrink-0 cursor-move select-none items-center justify-between border-border border-b bg-muted/40 px-3 py-2",
          isPopout ? "flex" : "hidden",
        )}
      >
        <span className="font-medium text-muted-foreground text-xs">Chat</span>
        <button
          type="button"
          onClick={onDock}
          className="text-muted-foreground outline-none transition hover:text-foreground"
          aria-label="Dock chat"
        >
          <FaXmark className="size-4" />
        </button>
      </div>

      {/* Pop-out button overlay (mounted mode only). */}
      <button
        type="button"
        onClick={onPopOut}
        aria-label="Pop out chat"
        className={cn(
          "absolute top-3 right-3 z-10 rounded-md border border-border bg-background/80 p-1.5 text-muted-foreground outline-none backdrop-blur transition hover:text-foreground",
          isPopout ? "hidden" : "hidden md:block",
        )}
      >
        <FaExpand className="size-3.5" />
      </button>

      {/* Chat content - STABLE position across modes (never remounts). */}
      <div className="relative min-h-0 flex-1">{children}</div>

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
```

- [ ] **Step 2: Verify the icons exist**

Run: `cd apps/web && node -e "const m=require('react-icons/fa6'); console.log(typeof m.FaExpand, typeof m.FaXmark)"`
Expected: `function function`. If either is `undefined`, substitute an existing icon (e.g. `FaUpRightAndDownLeftFromCenter` for expand, `FaCompress`/`FaAnglesRight` for dock) and adjust the import.

- [ ] **Step 3: Type-check**

Run: `cd apps/web && bun run type-check`
Expected: PASS. (`game-chat-split.tsx` is rewritten next; if it still references old internals this is fine until Task 6.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/play/[gameId]/chat-popout-window.tsx
git commit -m "feat(web): ChatPopoutWindow chrome (drag/resize/dock)"
```

---

## Task 6: Rewrite game-chat-split.tsx

**Files:**
- Rewrite: `apps/web/app/play/[gameId]/game-chat-split.tsx`

- [ ] **Step 1: Replace the file contents**

Replace `apps/web/app/play/[gameId]/game-chat-split.tsx` entirely with this full file:

```tsx
"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatLayout,
  type ChatMode,
  clampGameWidth,
  clampGeometry,
  DEFAULT_CHAT_LAYOUT,
  type PopoutGeometry,
  readChatLayout,
  writeChatLayout,
} from "@/lib/chat-layout";
import { clientFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { ChatPopoutWindow } from "./chat-popout-window";

const SAVE_DEBOUNCE_MS = 600;

/**
 * Side-by-side game + chat with a draggable divider (md+), collapsing to tabs
 * below md. The chat can pop out into a floating, draggable, resizable window;
 * when popped out the game pane goes full-width. The chat subtree is mounted
 * once and never remounts across mode toggles.
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
  const [width, setWidth] = useState(DEFAULT_CHAT_LAYOUT.dividerWidth);
  const [geometry, setGeometry] = useState<PopoutGeometry>(
    DEFAULT_CHAT_LAYOUT.popout,
  );
  const [tab, setTab] = useState<"game" | "chat">("game");

  // Live refs so persistence reads current values without re-subscribing.
  const modeRef = useRef(mode);
  const widthRef = useRef(width);
  const geomRef = useRef(geometry);
  modeRef.current = mode;
  widthRef.current = width;
  geomRef.current = geometry;

  // Debounced DB save (localStorage is written synchronously by persist()).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    const layout: ChatLayout = {
      mode: modeRef.current,
      dividerWidth: widthRef.current,
      popout: geomRef.current,
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

  // Resolve initial layout: localStorage wins, then DB, then defaults.
  // Pop-out is desktop-only - force mounted below md.
  useEffect(() => {
    const resolved = readChatLayout() ?? dbLayout ?? DEFAULT_CHAT_LAYOUT;
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;
    setMode(isDesktop ? resolved.mode : "mounted");
    setWidth(resolved.dividerWidth);
    setGeometry(resolved.popout);
  }, [dbLayout]);

  // Re-clamp the divider width to keep both panes in-bounds as the container
  // resizes (this is what makes the min/max responsive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth((w) => clampGameWidth(w, el.clientWidth));
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
        persist();
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [persist]);

  // Divider drag (md+ only).
  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMove = (ev: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        setWidth(clampGameWidth(ev.clientX - rect.left, el.clientWidth));
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
    persist();
  }, [persist]);

  const dock = useCallback(() => {
    setMode("mounted");
    persist();
  }, [persist]);

  const isPopout = mode === "popout";

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Mobile tab switcher (hidden on md+, and irrelevant while popped out). */}
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
        <div
          style={isPopout ? undefined : { width }}
          className={cn(
            "min-h-0 overflow-hidden",
            tab === "game" ? "flex" : "hidden md:flex",
            isPopout ? "w-full md:flex-1" : "max-md:!w-full md:shrink-0",
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
```

> Note: the divider's old `localStorage` persistence and the standalone width/window constants are gone (moved to `lib/chat-layout.ts`).

- [ ] **Step 2: Type-check**

Run: `cd apps/web && bun run type-check`
Expected: FAIL - `play-client.tsx` does not yet pass `dbLayout`. Proceed to Task 7 (the error is expected and resolved there).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/play/[gameId]/game-chat-split.tsx
git commit -m "feat(web): pop-out mode + responsive split, fix scrollbars"
```

---

## Task 7: Thread the DB layout through page + client

**Files:**
- Modify: `apps/web/app/play/[gameId]/play-client.tsx`
- Modify: `apps/web/app/play/[gameId]/page.tsx`

- [ ] **Step 1: Add the `dbLayout` prop to PlayClient**

In `apps/web/app/play/[gameId]/play-client.tsx`:

Add the import near the top:

```ts
import type { ChatLayout } from "@/lib/chat-layout";
```

Add `dbLayout` to the props type (after `initialNextCursor: string | null;`):

```ts
  dbLayout: ChatLayout | null;
```

Destructure it in the function params (after `initialNextCursor,`):

```ts
  dbLayout,
```

Pass it to `GameChatSplit` (in the returned JSX, alongside `game` and `chat`):

```tsx
    <GameChatSplit
      dbLayout={dbLayout}
      game={gameNode}
      chat={
        <ConversationView
          key={conversation.id}
          userId={userId}
          initialConversation={conversation}
          initialMessages={initialMessages}
          initialNextCursor={initialNextCursor}
        />
      }
    />
```

- [ ] **Step 2: SSR-fetch the layout in the page**

In `apps/web/app/play/[gameId]/page.tsx`:

Add the type import near the top:

```ts
import type { ChatLayout } from "@/lib/chat-layout";
```

After the existing conversation/messages fetching block (just before `return (`), add:

```ts
  // Pull the saved chat layout (DB fallback; localStorage wins on the client).
  const me = await serverFetchJson<{
    profile: { chatLayout: ChatLayout | null };
  }>("/api/profiles/me");
  const dbLayout = me?.profile?.chatLayout ?? null;
```

Pass it into `PlayClient` (add the prop):

```tsx
    <PlayClient
      gameId={gameId}
      userId={session.user.id}
      gameType={data.game.gameType}
      initialGame={data.game}
      initialMoves={data.moves}
      conversation={conversation}
      initialMessages={messages}
      initialNextCursor={nextCursor}
      dbLayout={dbLayout}
    />
```

- [ ] **Step 3: Type-check the whole repo**

Run: `bun run type-check`
Expected: PASS across all workspaces.

- [ ] **Step 4: Run the web + server tests**

Run: `bun run test`
Expected: PASS, including the two new `chat-layout` suites.

- [ ] **Step 5: Format**

Run: `bun run fix`
Expected: no errors; commit any reformatting.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/play/[gameId]/play-client.tsx apps/web/app/play/[gameId]/page.tsx
git commit -m "feat(web): SSR-load saved chat layout into the play split"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Start the app**

Run: `bun run db:start` (if not running) then `bun run dev`. Open a play page with a linked conversation at a desktop width.

- [ ] **Step 2: Verify the fixes/features**

- Drag the divider left/right: the game pane never shows scrollbars; the board is never crushed below its min; chat never grows past its max or shrinks below its min.
- Shrink/grow the browser window: the divider width re-clamps so both panes stay in-bounds.
- Click the pop-out button (top-right of chat): chat detaches to a floating window at the bottom-right; the game pane fills the full width.
- Drag the window by its header; resize from the bottom-left corner: it stays within the viewport; min size respected.
- Confirm the chat keeps its scroll position and live socket (send/receive a message) across pop-out ↔ dock - i.e. it did not remount.
- Reload: the mode + geometry + divider width restore from localStorage.
- In devtools, clear `localStorage gl_chat_layout`, reload: layout restores from the DB value instead.
- Narrow to a mobile width: the tab switcher returns and pop-out is unavailable; if popped out when narrowing, it falls back to mounted.

- [ ] **Step 3: Final commit (if any tweaks were needed)**

```bash
git add -A && git commit -m "chore: polish game-chat pop-out after manual QA"
```

---

## Self-review notes

- **Spec coverage:** scrollbar fix (Task 6, `overflow-hidden` panes) ✓; responsive min/max for both panes (Task 4 `clampGameWidth` + Task 6 ResizeObserver) ✓; pop-out/mounted toggle both ways (Task 5/6) ✓; draggable + resizable + bottom-right default (Task 5 + `clampGeometry`) ✓; full-width game when popped out (Task 6) ✓; desktop-only pop-out + mobile tabs (Task 6 matchMedia) ✓; localStorage + DB persistence, localStorage wins (Tasks 1–4, 6–7) ✓; mount preservation (Task 5 stable children position) ✓.
- **Type consistency:** `ChatLayout`/`PopoutGeometry`/`ChatMode` identical across web + server modules; `clampGameWidth`, `clampGeometry`, `parseChatLayout`, `readChatLayout`, `writeChatLayout`, `validateChatLayout`, `updateChatLayout` referenced with matching signatures everywhere.
- **Bounds mirror:** `apps/web/lib/chat-layout.ts` and `apps/server/src/lib/chat-layout.ts` duplicate the bounds intentionally (same pattern as `lib/theme.ts`); keep them in sync if changed.
