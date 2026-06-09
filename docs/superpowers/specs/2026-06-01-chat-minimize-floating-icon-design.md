# Chat minimize-to-floating-icon + Apple-PiP edge-stash: Design

**Date:** 2026-06-01
**Branch:** feat/game-chat-popout
**Status:** Approved (pending spec review)

## Summary

The play page's chat can be **docked (mounted)** or floated as a **popout** window.
This feature adds a third, orthogonal UI state: the chat can be **minimized** to a
small floating chat-bubble icon, freeing the screen while keeping the conversation
live. The floating bubble is draggable; dragging it off a viewport edge collapses it
(Apple picture-in-picture style) into a thin **edge-tab** chevron pinned to that edge.
Clicking the edge-tab restores the bubble at its last on-screen position; clicking the
bubble restores the chat to whichever mode it came from (mounted or popout).

Desktop-only (md+). Mobile keeps today's game/chat tab behavior unchanged.

## Decisions (from brainstorming)

- **Minimize entry points:** from *both* mounted and popout. Restoring returns to
  whichever mode was active.
- **Persistence:** persisted, but split by scope (see Persistence). Positions/sizes
  are device-local so a desktop layout can't break the mobile UI.
- **Edge-stash trigger:** the bubble morphs into the edge-tab *live* while dragging,
  the moment its center crosses a viewport edge.
- **Floating icon:** round chat-bubble button (theme primary) with an **unread badge**
  for messages that arrive while minimized.
- **Platform:** desktop only (md+). Mobile unaffected.

## State model

`lib/chat-layout.ts` (and its server mirror `apps/server/src/lib/chat-layout.ts`).

```ts
export type ChatMode = "mounted" | "popout"; // restore target when un-minimized
export type StashEdge = "left" | "right" | "top" | "bottom";
export type PopoutGeometry = { x: number; y: number; w: number; h: number };
export type IconPos = { x: number; y: number };

export type ChatLayout = {
  mode: ChatMode;
  minimized: boolean;          // collapsed to the floating bubble?
  stashEdge: StashEdge | null; // null = floating on-screen; set = stashed to that edge
  chatWidth: number;           // device-local
  popout: PopoutGeometry;      // device-local
  icon: IconPos;               // last on-viewport bubble position, device-local
};
```

`mode` keeps its existing meaning (mounted vs popout) and now doubles as the restore
target while `minimized` is true. `minimized` + `stashEdge` + `icon` are new.

### New constants

- `ICON_SIZE` - floating bubble diameter (≈ 56px).
- `EDGE_TAB_W` / `EDGE_TAB_H` - thin chevron tab dimensions.
- `ICON_MARGIN` - keep-on-screen margin for the floating bubble (reuse/mirror
  `POPOUT_MARGIN` semantics).
- `DEFAULT_ICON` - sentinel pulled to bottom-right by `clampIcon` (mirrors the
  `DEFAULT_POPOUT` sentinel pattern).

### New pure helpers (unit-tested)

- `clampIcon(icon: IconPos, vw: number, vh: number): IconPos` - keep the bubble fully
  on-screen within `ICON_MARGIN`. Resolves the bottom-right sentinel.
- `edgeForIcon(icon: IconPos, vw: number, vh: number): StashEdge | null` - given a live
  drag position, return the edge whose boundary the bubble center has crossed, else null.
  When multiple are crossed (corner), pick the one with the greatest overshoot.
- `stashTabPos(icon: IconPos, edge: StashEdge, vw: number, vh: number)` - coordinate +
  orientation for the edge-tab, derived from the bubble's last on-screen position
  (clamped along the edge).

`normalizeChatLayout` / `validateChatLayout` gain defaults for the new fields
(`minimized: false`, `stashEdge: null`, `icon: DEFAULT_ICON`) and validate the
`StashEdge` union.

## Persistence

Split by scope to honor "positions are device-local; a desktop layout must not break
mobile."

- **localStorage + cookie** (both device-local): the *full* `ChatLayout`, including
  `minimized`, `stashEdge`, `icon`, `popout`, `chatWidth`. The cookie keeps SSR
  flash-free **per device** (existing mechanism).
- **DB** (`profiles.chatLayout`, cross-device): **`mode` only**. No coordinates or sizes
  are written to the DB, so they can never cross devices. SSR resolves geometry from the
  cookie (else defaults); only `mode` falls back to the DB. `mode` already has a
  post-hydration mobile guard (popout → mounted below md), and `minimized` is ignored
  below md.

### Changes this implies

- `persistChatLayout(layout)` still writes the full layout to localStorage + cookie.
- The debounced `PUT /api/profiles/me/chat-layout` in `game-chat-split.tsx` sends
  `{ mode }` only.
- Server `validateChatLayout` (or a new narrower validator) accepts/stores `{ mode }`
  only; the stored jsonb shrinks to `{ mode }`.
- Page SSR (`apps/web/app/play/[gameId]/page.tsx`): geometry/minimized come from the
  cookie; the DB fallback supplies only `mode` (geometry → defaults when no cookie).

**Behavior change to confirm during implementation:** previously-saved DB geometry stops
being used cross-device; each device re-seeds geometry from its own cookie/defaults. This
is the intended effect of the correction.

## Components

### `apps/web/app/play/[gameId]/chat-floating-icon.tsx` (new)

- **Floating bubble:** `position: fixed` round button at `icon.{x,y}`, theme primary,
  chat-bubble glyph, with an **unread count badge** (hidden at 0). Draggable via the
  existing mouse-drag pattern.
  - Drag with no movement (click) → restore to `mode` (`onRestore`).
  - Drag whose center crosses an edge → **live** morph to the edge-tab (`edgeForIcon`);
    on release while crossed, commit `stashEdge` and persist the last on-screen `icon`.
  - On release while in-bounds, persist the clamped `icon`.
- **Edge-tab:** thin rounded chevron pinned to `stashEdge` (via `stashTabPos`), pointing
  inward. Click → un-stash: `stashEdge = null`, bubble reappears at `icon` (`onUnstash`).

Props: `{ minimized, stashEdge, icon, mode, unread, onRestore, onIconChange, onCommit }`
(shape finalized in the plan).

### `apps/web/app/play/[gameId]/chat-popout-window.tsx`

- Add an **X minimize button** (`FaXmark` from `react-icons/fa6`) in:
  - the popout header, beside the existing dock button;
  - the mounted top-right overlay cluster, beside the existing pop-out button.
  Both md+ only.
- New props `minimized` + `onMinimize`. When `minimized`, the window/pane chrome is
  hidden but the **chat children stay mounted and hidden** (display:none-style) so the
  socket subscription and message store stay alive for unread counting, consistent with
  the existing "children never remount across modes" rule.

### `apps/web/app/play/[gameId]/game-chat-split.tsx`

- Owns new state `minimized`, `stashEdge`, `icon`, seeded from `initialLayout`.
- Actions: `minimize()` (minimized=true), `restore()` (minimized=false, stashEdge=null),
  and the bubble drag handler with live edge detection (`stash`/`unstash` via geometry).
  All persist through the existing `persist(override?)` path.
- **Unread badge:** on `minimize()`, snapshot `messagesAtomFamily(conversationId).length`;
  `unread = currentLength − snapshot` (floored at 0); cleared to snapshot on `restore()`.
  Reads the in-memory message list, not server-backed unread.
- Renders `<ChatFloatingIcon>` when `minimized`; keeps `<ChatPopoutWindow>` mounted but
  hidden so chat children persist.
- Desktop-only: minimize controls hidden below md; dropping below md while minimized
  restores to mounted (mirror of the existing popout→mounted resize guard).
- Re-clamp `icon` on window resize (mirror of the existing `clampGeometry` effect).

### `apps/web/app/play/[gameId]/play-client.tsx`

- Pass `conversationId={conversation.id}` into `GameChatSplit` for unread counting.

## Interaction flow

1. mounted/popout → click **X** → minimized; bubble at last `icon` (default bottom-right).
2. drag bubble; center crosses an edge → live morph to edge-tab; release → `stashEdge`
   committed, last on-screen position saved as `icon`.
3. click **edge-tab** → bubble returns to `icon` (stashEdge → null).
4. click **bubble** → restore to `mode` (mounted or popout); unread cleared.

## Testing

Pure helpers are exported and unit-tested (`bun test`), matching the repo convention:

- `apps/web/tests/chat-layout.test.ts` (new or extended): `clampIcon` bounds + sentinel,
  `edgeForIcon` per edge + corner tie-break + null when in-bounds, `stashTabPos` along
  each edge, `normalizeChatLayout`/`parseChatLayout` defaults + round-trip for the new
  fields, `StashEdge` validation.
- `apps/server/tests/` mirror test for `validateChatLayout` (now `mode`-only) + any
  shared bounds.

Component drag/interaction is covered by the pure-helper tests plus manual verification;
no DOM test harness is introduced.

## Out of scope

- Mobile minimize / touch-drag of the bubble.
- Server-backed unread semantics for the badge.
- Persisting positions/sizes cross-device.
- Animating the morph beyond a simple CSS transition.
