# Game-chat UI: fix scrollbars, responsive min/max widths, and pop-out mode

Date: 2026-06-01

## Problem

The play page (`apps/web/app/play/[gameId]/`) shows a game and its linked chat
side-by-side via `game-chat-split.tsx` (the "mounted" layout). Three issues:

1. **Scrollbars appear when resizing / expanding-collapsing the chat.** The game
   pane wrapper has `overflow-auto` (`game-chat-split.tsx:113`). When the divider
   shrinks the game pane, the board overflows and the pane shows scrollbars; the
   chat side has its own internal `MessageList` scroll, so resizing feels janky
   and doubled.
2. **Only the game pane has width bounds.** Game is clamped `360–760px`; chat
   just takes `flex-1`, so it grows unbounded on wide screens and is crushable on
   narrow ones. We want both panes bounded and the clamp responsive to window
   size.
3. **No way to detach the chat.** We want the chat to optionally "pop out" into a
   floating, draggable, resizable window.

## Goals

- Eliminate the spurious scrollbars during resize.
- Give **both** panes responsive min/max widths (re-clamped on window resize).
- Add a **pop-out mode** alongside the existing **mounted mode**, toggleable both
  ways.
- Persist the user's choice (mode + geometry) to **localStorage and the DB**,
  with **localStorage winning** on conflict.

## Non-goals

- Pop-out on mobile (`< md`). Mobile keeps the current tab switcher; pop-out is a
  desktop-only control.
- Changing `ConversationView` or the `/chat` route. The chat component is shared;
  all new controls live in the play-page split, not in `ConversationView`.
- Multi-window / multiple simultaneous pop-outs.

## Design

### A. Scrollbar fix

The split panes should not scroll themselves - each child owns its scrolling
(the board renders within its own bounds; `MessageList` already scrolls
internally). Change the game-pane wrapper from `overflow-auto` to
`overflow-hidden`, and ensure the chat-pane wrapper is `overflow-hidden` too.
Combined with the min-widths below, the board is never crushed, so it never
needs to scroll.

### B. Responsive min/max widths

Bounds (px, but enforced against live container width so they behave
responsively):

- Game: `MIN_GAME = 360`, `MAX_GAME = 760` (unchanged).
- Chat: `MIN_CHAT = 280`, `MAX_CHAT = 420` (chat kept deliberately small).

The game pane's stored width is clamped into:

```
[ max(MIN_GAME, containerW - MAX_CHAT), min(MAX_GAME, containerW - MIN_CHAT) ]
```

so neither pane can violate its own bounds at any window size. A `ResizeObserver`
on the split container re-runs this clamp when the window/container resizes
(this is what makes it "relative/responsive"). Chat width = remaining space
(`flex-1`) and is therefore implicitly kept within `[MIN_CHAT, MAX_CHAT]` by the
game-width clamp. The divider drag uses the same clamp.

If the container is too narrow to satisfy both minimums (`containerW < MIN_GAME +
MIN_CHAT + divider`), we are already at/below the `md` breakpoint where the
layout switches to the mobile tab switcher, so this case does not arise on
desktop.

### C. Pop-out mode

**Mount preservation (key constraint).** The chat (`ConversationView`) must stay
mounted across a toggle so its socket subscription and scroll position survive.
We keep the chat subtree at one stable position in the React tree and relocate
its DOM with `createPortal`, swapping only the portal *target*:

- Mounted mode → target = an in-flow placeholder div inside the split.
- Pop-out mode → target = `document.body` (escapes any clipping/transformed
  ancestor cleanly).

Because the `createPortal(chat, target)` call stays at the same tree position and
only `target` changes, React preserves the subtree - no remount, no re-hydrate,
no re-join.

**Floating window** (`chat-popout-window.tsx`):

- Fixed-position card, **default bottom-right** of the viewport.
- **Draggable** by its header bar; **resizable** from a bottom-left corner handle
  (window is pinned bottom-right by default, so the free corner resizes). Both
  use the same hand-rolled `mousedown`/`mousemove`/`mouseup` pattern already used
  by the divider - **no new dependency**.
- Constrained to the viewport: position clamped so the header stays on-screen;
  size clamped to `[POPOUT_MIN_W, POPOUT_MAX_W] × [POPOUT_MIN_H, POPOUT_MAX_H]`
  and to the viewport. Re-clamped on window resize.
- Header contains the chat title affordance area and a **dock button** (icon) to
  return to mounted mode.

**Mounted-mode toggle.** A **pop-out icon button** sits at the top-right of the
chat pane (an absolutely-positioned icon button overlaid on the chat pane corner,
so it does not require editing `ConversationView`).

**Vacated space.** While popped out, the game pane goes **full-width**: the
divider and width logic are disabled and the game wrapper fills the container.

### D. Persistence (localStorage + DB, localStorage wins)

One layout blob:

```ts
type ChatLayout = {
  mode: "mounted" | "popout";
  dividerWidth: number;            // game pane px
  popout: { x: number; y: number; w: number; h: number };
};
```

**Client (`game-chat-split.tsx`):**

- On mount, resolve initial layout as `localStorage(gl_chat_layout) ?? dbLayout
  ?? DEFAULT_CHAT_LAYOUT` - localStorage prevails.
- `dbLayout` is fetched server-side in `play/[gameId]/page.tsx` (one extra
  `serverFetchJson` to `/api/profiles/me`, which now also returns `chatLayout`)
  and passed down through `PlayClient`.
- On every change: write localStorage **immediately** (synchronous source of
  truth) and **debounced** (~600ms) `PUT /api/profiles/me/chat-layout` to the DB.

**Server:**

- Add nullable `chatLayout` jsonb column to `user_profile`
  (`apps/server/src/db/schema.ts`), typed `ChatLayout | null`, default null.
  Generate + apply a Drizzle migration (`db:generate`, `db:migrate`).
- `GET /api/profiles/me` response includes `chatLayout`.
- New `PUT /api/profiles/me/chat-layout` - validates the shape (mode enum;
  finite, in-range numbers; clamps server-side as defense) and calls a new
  `updateChatLayout(userId, layout)` repo fn (mirrors `updateAppearance`).
- Validation lives in a small pure helper so it is unit-testable without HTTP.

### E. Component shape

`game-chat-split.tsx` is doing enough that we split it:

- `game-chat-split.tsx` - owns mode + layout state, the stable chat portal, the
  `ResizeObserver`/clamp, persistence (localStorage + debounced PUT), and renders
  the mounted layout (with divider) vs full-width game.
- `chat-popout-window.tsx` - the floating window: drag, resize, viewport clamp,
  header + dock button.
- `lib/chat-layout.ts` (web) - `ChatLayout` type, defaults, bounds constants,
  parse/clamp helpers (pure, unit-testable), localStorage read/write.

Server validation helper colocated with the profiles route or in
`apps/server/src/lib/` to match `lib/theme.ts`.

## Testing

- **Web unit** (`apps/web/tests/`): `chat-layout` parse/clamp helpers - bad
  localStorage JSON falls back to defaults; out-of-range widths/geometry clamp;
  game-width clamp respects both panes' min/max across container widths;
  viewport clamp keeps the window header on-screen.
- **Server unit** (`apps/server/tests/`): `chat-layout` validation helper -
  rejects bad mode, non-finite numbers, out-of-range values; accepts and clamps
  valid input. Mirror `theme.test.ts`.
- Manual: toggle pop-out/dock (chat keeps scroll + socket), drag/resize within
  viewport, resize window re-clamps, no scrollbars while dragging the divider,
  reload restores from localStorage, clearing localStorage falls back to DB.

## Rollout / files touched

- `apps/server/src/db/schema.ts` (+ migration), `db/repositories/profiles.ts`,
  `api/routes/profiles.ts`, `lib/` validation helper, server test.
- `apps/web/app/play/[gameId]/page.tsx`, `play-client.tsx`,
  `game-chat-split.tsx`, new `chat-popout-window.tsx`, `lib/chat-layout.ts`,
  `lib/api-server.ts`/`api-client.ts` usage, web test.

## Deferred

- Cross-device real-time sync of layout (we persist to DB but do not push live
  updates between a user's open sessions).
- Pop-out on mobile.
