# Web App: Next.js App Router, Data Fetching, Jotai & Game Rendering

## What this is / why it matters

`apps/web` is the Next.js 16 (React 19, App Router) frontend for the GameLobby. It is the only thing the user's browser ever talks to directly, but it is **not** where the truth lives: the real-time state, the authoritative game engine, and the persistent data all live in `apps/server` and the shared `packages/`. The web app's job is to be a fast, well-hydrated *view* over that truth, plus a thin shell of optimistic UI that the server is free to correct.

A few load-bearing ideas make this whole app comprehensible. Understand these four and the rest falls into place:

1. **Two fetch paths, never mixed.** Server Components fetch through `lib/api-server.ts` (cookie-forwarding, `cache: "no-store"`, hits `API_URL`); Client Components fetch through `lib/api-client.ts` (`credentials: "include"`, hits `NEXT_PUBLIC_API_URL`). The split exists because RSC runs on the Node side where there is no browser cookie jar, and client code runs in the browser where there are no Next request headers.
2. **SSR hydrates, the socket takes over.** Every server page does one initial authenticated fetch and passes the result down as `initial*` props. A client "bridge" seeds those props into Jotai atoms exactly once, then a single Socket.IO connection mutates those atoms for the rest of the session. The first paint is correct and personalized; everything after is live.
3. **Jotai-first state.** Any state shared by two or more components is a Jotai atom (`lib/chat/atoms.ts`, `lib/sidebar-atoms.ts`). `useState` is reserved for state that is genuinely private to one component (a dialog's open/closed flag, a form's draft values).
4. **One route renders every game.** There are no per-game folders. `app/games/[gameType]/page.tsx` and `app/play/[gameId]/play-client.tsx` are data-driven by `listGameMeta()` / `getDefinition()` (from `games-core`) and `getGameClient()` (from `games-client`). Adding a game touches packages, not routes.

The deeper *why* behind all of it: **the same engine and Zod schemas that inform the client also authoritatively validate moves on the server, so the client is never trusted.** The web app can render an optimistic board, but the server re-runs the engine on every move and broadcasts the canonical state back. That is why the client code below is comfortable being "wrong" briefly - it knows a `game_state` broadcast will overwrite anything it guessed.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/web/app/layout.tsx` | Root Server Component; one authenticated fan-out fetch, sets `<html>` theme/pattern attrs, injects no-flash boot scripts, threads an `isAnonymous` flag, wraps everything in `Providers` + `AppShellClient`. |
| `apps/web/app/providers.tsx` | Client wrapper: `next-themes` `ThemeProvider` (light/dark) + `AppearanceProvider` (palette/pattern). |
| `apps/web/app/app-shell.tsx` | Client shell: Jotai `Provider`, `SocketProvider`, `GuestNudge`, `ChatSocketBridge`, sidebar + `<main>`. |
| `apps/web/app/page.tsx` | Home grid of games, rendered from `listGameMeta()`. |
| `apps/web/app/sidebar.tsx` | The collapsible, resizable left rail rendered by `AppShellClient` (logo, nav, `SidebarSocialNav`, profile/avatar entry); persists collapsed/width via the sidebar atoms + cookie. |
| `apps/web/app/sidebar-social-nav.tsx` | The "Social" nav cluster in the sidebar (the Chat link with its `totalUnreadAtom` badge; Friends now lives in the profile page's overflow menu, not here). |
| `apps/web/app/[username]/page.tsx` | Catch-all `/[username]` profile route (Server Component): resolves the handle, fetches the profile + activity, renders `ProfilePageView`. Shadowed by `RESERVED` segments / `RESERVED_USERNAMES`. |
| `apps/web/app/[username]/profile-ui.tsx` | Client profile UI: header, stats, activity feed, and the overflow menu that now hosts the Friends entry. |
| `apps/web/lib/api-server.ts` | `server-only` `serverFetch` / `serverFetchJson`: forwards cookies, `cache: "no-store"`, uses `API_URL`. |
| `apps/web/lib/api-client.ts` | `"use client"` `clientFetch` / `clientFetchJson`: `credentials: "include"`, uses `NEXT_PUBLIC_API_URL`. |
| `apps/web/lib/get-server-session.ts` | `cache()`-wrapped `serverFetchJson("/api/auth/get-session")`; one session lookup per request. The session user carries an optional `isAnonymous` (a guest is still a real session). |
| `apps/web/lib/auth-client.ts` | Better Auth React client with the `anonymousClient()` plugin (`signIn.social`, `signIn.anonymous`), pointed at `NEXT_PUBLIC_API_URL`. |
| `apps/web/lib/auth/ensure-identity.ts` | `ensureIdentity()`: if `authClient.getSession()` has no session, mints a guest one via `authClient.signIn.anonymous()`. |
| `apps/web/app/auth/guest-button.tsx` | `"use client"` "Continue as a guest" button: `ensureIdentity()` then `router.push("/")` + `router.refresh()`. |
| `apps/web/app/guest-nudge.tsx` | `"use client"` fixed "Sign in to save your games" prompt; renders `null` unless `isAnonymous`, otherwise a Google `signIn.social` button. |
| `apps/web/lib/socket/socket-context.tsx` | `SocketProvider`, `useSocket`, `useSocketEvent`, `emitAck`: one shared Socket.IO connection + ack-promise helper. |
| `apps/web/app/chat-socket-bridge.tsx` | Hydrates chat atoms from SSR props, then maps every `CHAT_EVENTS.*` socket event onto a Jotai store mutation. |
| `apps/web/lib/chat/atoms.ts` | Shared chat state: conversations, messages (atomFamily), friends, requests, notifications, presence, typing, derived totals, pure upsert helpers. |
| `apps/web/lib/sidebar-atoms.ts` | `atomWithStorage` atoms for sidebar collapsed/width, with SSR-safe and width-clamping storage adapters. |
| `apps/web/lib/audio/atoms.ts` | `gameSfxAtom` / `gameMusicAtom` (`atomWithStorage`): the two client-only audio preference channels (volume + mute), seeded from `@gamelobby/shared` defaults. |
| `apps/web/lib/audio/use-audio-bridge.ts` | `useGameAudioBridge()`: pushes the audio atoms into the `games-client` `GameAudioEngine`, marks music active for the play screen, and registers the gesture unlock. |
| `apps/web/lib/use-media-query.ts` | `useMediaQuery(query)`: SSR-safe `matchMedia` subscription via `useSyncExternalStore` (returns `false` on the server). A reusable client hook for breakpoint-driven UI. |
| `apps/web/app/play/[gameId]/game-settings-gear.tsx` | The sliding `FaGear` button (CSS `--gear-shift` transform, driven by `shifted`/`offset` props) that opens the settings modal via the layered-popup host. |
| `apps/web/app/play/[gameId]/game-settings-panel.tsx` | Settings modal body: per-channel mute toggle + −/+ + range slider for game sound and background music. |
| `apps/web/lib/sidebar-atoms-shared.ts` | Storage keys + `clampWidth` / `clampWidthSafe` helpers shared by the atoms and the cookie/boot-script machinery. |
| `apps/web/lib/sidebar-prefs.ts` | `SIDEBAR_PREFS_COOKIE` + `SIDEBAR_LS_BOOT_SCRIPT` + `parseSidebarPrefsCookieValue` / `persistSidebarPrefsToCookie`: the cookie contract and the no-flash boot script the layout injects. |
| `apps/web/lib/appearance.tsx` | `AppearanceProvider` + `usePalette`/`usePattern`/`useColorModeSetting`; persists appearance via `clientFetch` PUT. |
| `apps/web/app/games/[gameType]/page.tsx` | The single dynamic game-lobby route; `hasEngine` gate + `getDefinition` drive `GameLobby`. |
| `apps/web/app/games/_shared/game-lobby.tsx` | Renders `configFields` form + "Play with a friend" button → `ConversationPicker`. |
| `apps/web/app/games/components/conversation-picker.tsx` | "Play with…" modal: picks a conversation/friend, emits `createGameInConversation`, routes to `/play/:id`. |
| `apps/web/app/games/[gameType]/[gameId]/page.tsx` | Legacy redirect: `/games/<type>/<id>` → `/play/<id>` (the `[gameId]` segment is now a room code, passed straight through). |
| `apps/web/app/play/[gameId]/page.tsx` | SSR-fetches game + moves (+ conversation + messages), gates on auth + game **code** (`isGameCode`, then normalizes and redirects to the canonical uppercase code), resolves the chat layout, renders `PlayClient`. |
| `apps/web/app/play/[gameId]/play-client.tsx` | Resolves `getGameClient` / `getGameSkeleton`, renders the board in `<Suspense>` over the shared socket, optionally side-by-side with chat via `GameChatSplit`, and mounts the `GameOverOverlay` above it. |
| `apps/web/app/play/[gameId]/game-over-overlay.tsx` | The game-over popup (chess.com-style): auto-opens on completion / abandon (and on revisit of a finished game), shows the outcome + both players' avatars with the winner highlighted (or the `SeriesScoreboard` for a series of ≥ 2), and offers Rematch / Go to rematch / Chat (back to the conversation via its friendly URL) / View series / Close. It is **non-blocking** - no backdrop, zero shadow, the container is `pointer-events-none` so the sidebar/chat/settings stay clickable, and a document `mousedown` listener closes it on any outside click (suppressed while a layered popup is open). |
| `apps/web/components/games/series-scoreboard.tsx` | `SeriesScoreboard`: avatars-over-score (wins + a draw tally) for the series, shared by the game-over modal, the series modal, and the chat game card. |
| `apps/web/components/games/series-detail-modal.tsx` | `SeriesDetailModal`: fetches `GET /api/games/:gameId/series` and renders the scoreboard + a linked list of every game in the series. |
| `apps/web/app/chat/[handle]/game-card-message.tsx` | The chat game card: status pill + Open/Join/Spectate/View link, plus (once the series has ≥ 2 games) the scoreboard, "View series", and a "Rematch" button. |
| `apps/web/app/play/[gameId]/loading.tsx` | Route `loading.tsx`: reads the chat-layout cookie and renders `<PlaySkeleton layout={…} />` during the SSR fetch. |
| `apps/web/app/play/[gameId]/play-skeleton.tsx` | Layout-aware skeleton mirroring `GameChatSplit` (docked / popout / minimized) and the settings gear, all positioned from the chat-layout cookie. |
| `apps/web/lib/chat-layout.ts` | `ChatLayout` type + `parseChatLayoutCookie` / `normalizeChatLayout` + layout geometry constants; the layout cookie/localStorage contract shared by page, loading, and `GameChatSplit`. |
| `apps/web/app/chat/[handle]/page.tsx` | SSR conversation page; resolves the handle as a **username** → DM (`/api/conversations/with/:username`). Raw `/chat/:id` URLs are no longer supported. |
| `apps/web/app/chat/group/[name]/page.tsx` | SSR group page; resolves a group by **name** → conversation (`/api/conversations/group/:name`, member-gated). |
| `apps/web/lib/chat/conversation-href.ts` | `conversationHref(conversation, userId)` → `/chat/<username>` for a DM, `/chat/group/<name>` for a group. The single source of friendly conversation URLs (sidebar, new-group redirect, game-over Chat button). |
| `apps/web/app/chat/[handle]/conversation-view.tsx` | Client conversation UI: hydrates messages atom, marks read, renders list/composer/typing. |
| `apps/web/app/settings/layout.tsx` | Settings shell: header + `SettingsTabs` nav (Account \| Appearance) wrapping the sub-route pages. |
| `apps/web/app/settings/page.tsx` | Redirects `/settings` → `/settings/account` (the default tab). |
| `apps/web/app/settings/settings-tabs.tsx` | Client sub-route nav; active tab from `usePathname()`. |
| `apps/web/app/settings/account/page.tsx` | Account tab: identity form + email + sessions + sign-out/revoke; fetches `/api/profiles/me` to seed the identity form. |
| `apps/web/app/settings/appearance/page.tsx` | Redirects `/settings/appearance` → `/settings/appearance/theme` (the default sub-tab). |
| `apps/web/app/settings/appearance/{theme,doodles}/page.tsx` | Appearance sub-routes (Server Components): each resolves the session and renders `AppearanceShell` around the `ThemePicker` / `DoodlePicker`. |
| `apps/web/app/settings/appearance-shell.tsx` | Server shell: the Appearance card + heading + `AppearanceTabs` sub-nav, wrapping the active picker. |
| `apps/web/app/settings/appearance-tabs.tsx` | Client `Link`-based Theme \| Doodles sub-nav; active tab from `usePathname()`. |
| `apps/web/app/settings/account-identity-form.tsx` | Client form to edit display name + username (debounced live availability check, suggestion chips, cooldown lock). |
| `apps/web/app/settings/theme-picker.tsx` | Hover-preview palette/color-mode picker driven by the appearance context. |
| `apps/web/next.config.ts` | `transpilePackages` for the raw-TS workspace packages (`@gamelobby/shared`, `@gamelobby/games-core`, `@gamelobby/games-client`). |
| `apps/web/app/globals.css` | Tailwind v4 entry; `@source` so Tailwind scans games-client classes. |
| `packages/games-client/src/registry.ts` | `getGameClient(type)` maps a game type to its board component (currently the statically-imported, SSR'd `TicTacToeGameClient`; the registry type also permits a `React.lazy` board for a heavy future game); `getGameSkeleton(type)` returns its `<Suspense>` fallback (or `DefaultGameSkeleton`). |
| `packages/games-client/src/types.ts` | `GameClientProps`: the contract every game board receives (incl. the optional `onViewProfile` callback). |

---

## RSC vs. client fetch: the two-path rule

This is the first thing to internalize because it explains every "why is there a server version and a client version" question.

`lib/api-server.ts` is marked `import "server-only"`, which makes the bundler throw a build error if a Client Component ever imports it. It reads the incoming request's cookies via `next/headers` and forwards them to the backend, so the backend's Better Auth session check sees the same cookie the browser sent. It always uses `cache: "no-store"` because this is per-user, session-scoped data that must never be shared across requests:

```ts
export async function serverFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });
}
```

See `apps/web/lib/api-server.ts:9`. Note `serverFetchJson` (`apps/web/lib/api-server.ts:24`) swallows non-OK responses and JSON parse errors and returns `null` - server pages then decide to `notFound()` / `redirect()` based on that `null`, rather than throwing during render.

`lib/api-client.ts` is the browser-side counterpart. It cannot read Next request headers (there is no request - it runs in the browser), so it relies on `credentials: "include"` to make the browser attach the session cookie automatically, and it targets `NEXT_PUBLIC_API_URL` (the public env var, the only kind exposed to client bundles):

```ts
export async function clientFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
  });
}
```

See `apps/web/lib/api-client.ts:6`. The contrasting error handling matters: `clientFetchJson` (`apps/web/lib/api-client.ts:16`) **throws** on non-OK, because client callers are inside event handlers / effects and want to `catch` and show an error, whereas server callers want a soft `null`.

The two env vars differ deliberately. `API_URL` (server) can point at an internal/private hostname the browser can never reach; `NEXT_PUBLIC_API_URL` (client) must be a publicly routable URL. `api-server.ts` falls back to `NEXT_PUBLIC_API_URL` then `localhost:4000` (`apps/web/lib/api-server.ts:4`) for dev convenience.

**Rule of thumb:** if you are in a file with `"use client"` at the top (or imported only by such files), use `clientFetch*`. Otherwise (Server Component, `cache()`d helper) use `serverFetch*`. Mixing them fails fast thanks to `server-only`.

---

## The root layout: one fetch, correct first paint

`app/layout.tsx` is an `async` Server Component and the linchpin of "correct first paint." It calls `getServerSession()` once, and if there is a user it issues **one parallel fan-out** of authenticated fetches:

```tsx
const [me, convs, fr, reqs, notif, notifList] = await Promise.all([
  serverFetchJson<{ profile: { ... } }>("/api/profiles/me"),
  serverFetchJson<{ conversations: ConversationJson[] }>("/api/conversations"),
  serverFetchJson<{ friends: FriendshipJson[] }>("/api/friends"),
  serverFetchJson<{ incoming: FriendshipJson[]; outgoing: FriendshipJson[] }>(
    "/api/friends/requests",
  ),
  serverFetchJson<{ count: number }>("/api/notifications/unread-count"),
  serverFetchJson<{ notifications: NotificationJson[] }>(
    "/api/notifications?limit=50",
  ),
]);
```

See `apps/web/app/layout.tsx:78`. Everything here becomes `initial*` props handed down to `AppShellClient`, which become the seed values for Jotai atoms. That is why a signed-in user's sidebar, unread badges, and friends list are *already correct in the server-rendered HTML* - no client loading spinner, no flash.

`getServerSession` is wrapped in React's `cache()` (`apps/web/lib/get-server-session.ts`), so even though the layout and individual pages all call it, the underlying `/api/auth/get-session` round-trip happens at most once per request. A guest counts as "signed in" here: the session it returns is a real one (its user simply carries `isAnonymous: true`), so the layout computes `isAnonymous = Boolean(session?.user?.isAnonymous)` (`apps/web/app/layout.tsx:64`), runs the same authenticated fan-out, and threads `isAnonymous` down to `AppShellClient` (`apps/web/app/layout.tsx:174`). Because of this, **the socket and chat work unchanged for guests** - nothing branches on the flag except the upgrade nudge.

The layout also sets appearance state on `<html>` from the server-known profile so there is no theme flash:

```tsx
<html
  lang="en"
  suppressHydrationWarning
  data-theme={userTheme ?? DEFAULT_THEME}
  data-pattern={userPattern ?? DEFAULT_PATTERN}
  style={patternStyle}
  className={`${geistSans.variable} ${geistMono.variable} ${gamePaused.variable} h-full antialiased`}
>
```

See `apps/web/app/layout.tsx:131`. The `style={patternStyle}` writes the `--pattern-url` / `--pattern-tile` CSS vars at SSR (from `patternVars`, `apps/web/app/layout.tsx:116`) so the doodle background lands without a flash. For *signed-out* users (whose preference lives only in `localStorage`, not on the server), four inline `dangerouslySetInnerHTML` boot scripts run before first paint to apply the stored theme/pattern/sidebar prefs synchronously (`apps/web/app/layout.tsx:141`). `suppressHydrationWarning` is set because these scripts intentionally mutate the DOM before React hydrates. The cookie path (`SIDEBAR_PREFS_COOKIE`, read at `apps/web/app/layout.tsx:125`) lets the server pre-trust sidebar prefs it can read from the request.

### Provider stack

`Providers` (`apps/web/app/providers.tsx`) is the outermost client boundary: `next-themes` `ThemeProvider` for light/dark (`storageKey="gl-color-mode"`, `attribute="class"`) wrapping `AppearanceProvider` for palette + doodle pattern.

`AppShellClient` (`apps/web/app/app-shell.tsx`) nests the runtime providers in a specific order that is worth reading top-down:

```tsx
<TooltipProvider delayDuration={300}>
  <Provider>
    <SocketProvider enabled={signedIn}>
      <GuestNudge isAnonymous={isAnonymous} />
      {signedIn && userId ? (
        <ChatSocketBridge userId={userId} initialConversations={...} ... />
      ) : null}
      ...
    </SocketProvider>
  </Provider>
</TooltipProvider>
```

See `apps/web/app/app-shell.tsx:62`. The Jotai `<Provider>` must wrap `ChatSocketBridge` (so the bridge has a store to write into) and `SocketProvider` must wrap it too (so it has a socket to listen on). `enabled={signedIn}` means the socket only connects for authenticated users - which **includes guests**, since a guest is signed in. `<GuestNudge isAnonymous={isAnonymous} />` (`apps/web/app/app-shell.tsx:65`) renders the fixed "Sign in to save your games" prompt and returns `null` unless the session is anonymous, so it is inert for Google users. The only `useState` in this file is `mobileOpen` (`apps/web/app/app-shell.tsx:55`) - a textbook case of component-private state that correctly stays out of Jotai.

**The shell scrolls an inner element, not the document.** The shell is `h-screen overflow-hidden` with a fixed `Sidebar` and a `<main className="… overflow-auto">` that owns the page scroll - this is what lets chat (pinned composer + reverse-scroll list) and the play/game pages (full-height boards) bound themselves to the viewport. The cost is that the browser's native scroll restoration (which only tracks the *document* scroller) can't restore position on reload. `useScrollRestoration` (`apps/web/lib/use-scroll-restoration.ts`) closes that gap: it persists `<main>`'s `scrollTop` to `sessionStorage` keyed by `pathname`, and on mount / route change it **smoothly animates** back to the saved offset (after paint, via `scrollTo({ behavior: "smooth" })`, honoring `prefers-reduced-motion`; intermediate saves are suppressed while the restore animates). It's a no-op on the full-viewport pages, where `<main>` itself never scrolls.

---

## Realtime client: one socket, ack-promises, event hooks

`lib/socket/socket-context.tsx` owns the single browser↔server Socket.IO connection for the whole app. `SocketProvider` creates the connection in an effect keyed on `enabled` (`apps/web/lib/socket/socket-context.tsx:36`), and tears the socket down on unmount. The connection **status** lives in a module-level Jotai atom, `socketStatusAtom` (`apps/web/lib/socket/socket-context.tsx:17`, a `SocketStatus` of `connecting | connected | disconnected`): `SocketProvider` writes it via `useSetAtom` as the socket connects / disconnects / reconnects, and any consumer reads it with `useAtomValue(socketStatusAtom)`. Keeping the status out of the context value means a status flip doesn't re-render every `useSocket()` consumer - only the components that actually read the atom. The connection is WebSocket-only with credentials and auto-reconnect:

```ts
const s = io(url, {
  path: "/socket.io",
  withCredentials: true,
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 5000,
});
```

See `apps/web/lib/socket/socket-context.tsx:45`. `withCredentials: true` is the socket analogue of `clientFetch`'s `credentials: "include"` - it sends the session cookie on the handshake so the server's socket middleware can authenticate the connection.

Two helpers make this ergonomic:

- `useSocketEvent(event, handler)` (`apps/web/lib/socket/socket-context.tsx:77`) subscribes a component to a server event. It stores the handler in a ref and updates the ref every render, so the effect that wires `socket.on` only re-runs when the socket or event name changes - the latest closure is always called without churning subscriptions.
- `emitAck(socket, event, payload)` (`apps/web/lib/socket/socket-context.tsx:95`) turns Socket.IO's callback-style acknowledgements into a `Promise`, and **rejects** when the server replies `{ ok: false, error }`. This is how the client issues request/response-style actions over the socket (creating a game, creating a DM, marking read) and `await`s the result.

### The chat bridge: socket events → atom mutations

`app/chat-socket-bridge.tsx` renders `null` - it exists purely for its effects. It does two jobs.

First, it **hydrates** the chat atoms once with the SSR `initial*` props using `useHydrateAtoms` (`apps/web/app/chat-socket-bridge.tsx:61`). This is what fuses the server's first paint with the client's live store: the atoms start out holding exactly what the layout fetched.

Second, it registers a `useSocketEvent` for every chat event and translates each into an imperative `store.set(...)`. For example, an incoming message both upserts into the per-conversation messages atom and reorders/bumps the conversations list (incrementing `unreadCount` unless the message is mine or the conversation is active):

```tsx
useSocketEvent<ServerMessageNew>(
  CHAT_EVENTS.messageNew,
  ({ message, clientId }) => {
    const msg = clientId ? { ...message, clientId } : message;
    store.set(messagesAtomFamily(message.conversationId), (prev) =>
      upsertMessage(prev, msg),
    );
    const activeId = store.get(activeConversationIdAtom);
    store.set(conversationsAtom, (prev) => {
      const idx = prev.findIndex((c) => c.id === message.conversationId);
      const cur = idx < 0 ? undefined : prev[idx];
      if (!cur) return prev;
      const fromMe = message.sender?.id === userId;
      const isActive = activeId === message.conversationId;
      const updated: ConversationJson = {
        ...cur,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        unreadCount:
          fromMe || isActive ? cur.unreadCount : cur.unreadCount + 1,
      };
      return [updated, ...prev.filter((_, i) => i !== idx)];
    });
  },
);
```

See `apps/web/app/chat-socket-bridge.tsx:80`. The bridge uses Jotai's imperative `useStore()` rather than `useAtom` because it never *reads* reactively - it is a pure write-side adapter, and `store.set` from inside event callbacks avoids needless re-renders of the bridge itself. The `clientId` plumbing reconciles optimistic local messages with their server-confirmed versions (see `upsertMessage` below).

---

## Jotai state: the "shared = atom" convention

`lib/chat/atoms.ts` is the chat domain's shared state surface. The defining convention of this app: **state read or written by ≥2 components is an atom; `useState` is only for single-component-private state.** That is why message lists, conversations, presence, and unread counts are atoms (many components and the socket bridge touch them) while a dialog's open flag is `useState`.

Two patterns to note:

- **`atomFamily` for per-key state.** Messages and typing indicators are keyed by `conversationId`, so they use `atomFamily` (`apps/web/lib/chat/atoms.ts:28` and `:43`). Each conversation gets its own independently-subscribable atom; opening conversation B never re-renders subscribers of conversation A.
- **Derived atoms for totals.** `totalUnreadAtom` (`apps/web/lib/chat/atoms.ts:47`) and `pendingRequestCountAtom` (`apps/web/lib/chat/atoms.ts:58`) are read-only derived atoms - the unread badge in the sidebar recomputes automatically whenever `conversationsAtom` changes, with no manual bookkeeping.

The file also exports **pure** upsert helpers (`upsertMessage`, `upsertConversation`, `upsertFriend`, `bumpConversation`) that take a list and return a new list. Keeping them pure and exported is the project's testability convention - they can be unit-tested without React or a store. `upsertMessage` is the reconciliation heart of optimistic sends:

```ts
export function upsertMessage(
  list: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (incoming.clientId) {
    const i = list.findIndex(
      (m) => m.clientId && m.clientId === incoming.clientId,
    );
    if (i >= 0) {
      const copy = [...list];
      copy[i] = incoming;
      return copy;
    }
  }
  const byId = list.findIndex((m) => m.id === incoming.id);
  if (byId >= 0) {
    const copy = [...list];
    copy[byId] = incoming;
    return copy;
  }
  return [...list, incoming];
}
```

See `apps/web/lib/chat/atoms.ts:62`. It dedupes first by the optimistic `clientId` (replacing the pending bubble with the server's authoritative row) and then by server `id`, so a message delivered both via the emit-ack and via the broadcast never doubles up.

### Storage-backed atoms (and SSR safety)

`lib/sidebar-atoms.ts` uses `atomWithStorage` so the sidebar's collapsed flag and pixel width survive reloads. The interesting part is the custom storage adapters that make this SSR-safe and self-healing. `sidebarWidthStorage.getItem` (`apps/web/lib/sidebar-atoms.ts:30`) returns the initial value when `window` is undefined (server render), clamps the stored value into `[MIN, MAX]`, and even *rewrites* localStorage if the stored value was out of range. It also implements `subscribe` (`apps/web/lib/sidebar-atoms.ts:52`) so width changes in one tab propagate to others via the `storage` event.

The clamping logic and storage keys live in `lib/sidebar-atoms-shared.ts` precisely so they can be imported by *both* the client atoms and the cookie/boot-script machinery in `lib/sidebar-prefs.ts` - the same `clampWidth` invariant is enforced before paint (the `SIDEBAR_LS_BOOT_SCRIPT`, `apps/web/lib/sidebar-prefs.ts:69`) and at runtime (atom). `lib/sidebar-prefs.ts` also owns the `SIDEBAR_PREFS_COOKIE` and its parse/persist helpers; `layout.tsx` imports the boot script and the cookie parser (`apps/web/app/layout.tsx:23`–`:27`) and renders the script in `<head>`. This shared-helper split is the same logic-reuse instinct as the packages, applied within the web app.

---

## Appearance: theme, palette, pattern

Appearance is split across three layers, and which layer owns what is the key to understanding it:

- **Color mode (light/dark/system)** is owned by `next-themes` (`apps/web/app/providers.tsx:29`), toggling a `class` on `<html>` with `storageKey="gl-color-mode"`.
- **Palette** (named color schemes) and **pattern** (background doodles) are owned by `AppearanceProvider` (`apps/web/lib/appearance.tsx:64`), which sets `data-theme` / `data-pattern` attributes on `<html>` in effects and mirrors to `localStorage`. The pattern effect calls `applyPattern` (`apps/web/lib/patterns.ts`), which - besides the `data-pattern` attribute - writes the `--pattern-url` / `--pattern-tile` CSS custom properties **inline on `<html>`** straight from the `PATTERNS` catalog. The single `.app-canvas::before` rule in `globals.css` masks the page with those vars (`mask: var(--pattern-url) repeat; mask-size: var(--pattern-tile)`), so adding a pattern is purely a data change (a `PATTERNS` entry + its generated SVG, produced by `apps/web/scripts/gen-pattern-tiles.ts` from Lucide icons as seamless edge-wrapped tiles) with **no per-pattern CSS** - the same `applyPattern` helper drives the provider effect, the picker's hover preview, and the inline boot script, and `layout.tsx` sets the same vars at SSR via `patternVars` to avoid a flash.
- **Persistence** for signed-in users goes back to the server via `clientFetch` PUT to `/api/profiles/me/appearance` (`apps/web/lib/appearance.tsx:35`) - note this is a *client* fetch because it fires from a click handler.
- **Catalogs & helpers** - the palette/pattern *display* tables (`THEMES` / `PATTERNS` with their color/preview data) and lookups (`getThemeDef` / `getPatternDef`) now live in `@gamelobby/shared/constants`. `apps/web/lib/themes.ts` and `apps/web/lib/patterns.ts` **re-export that shared core** - the display tables, the id catalogs, and the guards (`THEMES` / `THEME_IDS` / `DEFAULT_THEME` / `getThemeDef` / `isValidTheme` from `apps/web/lib/themes.ts:3`; `PATTERNS` / `PATTERN_IDS` / `DEFAULT_PATTERN` / `getPatternDef` / `isValidPattern` from `apps/web/lib/patterns.ts:15`) - and add only the web-only runtime shims on top: the SSR boot scripts (`PALETTE_BOOT_SCRIPT` at `apps/web/lib/themes.ts:20`, `PATTERN_BOOT_SCRIPT` at `apps/web/lib/patterns.ts:49`) plus `patternVars` / `applyPattern` (`apps/web/lib/patterns.ts:25`). So the client and server agree on the *catalog and valid set* (one source of truth in `@gamelobby/shared`) while the browser owns only the *boot-time application*. `apps/web/lib/chat-layout.ts` follows the same pattern: it re-exports the shared `ChatMode`/geometry bounds (`MIN_CHAT`, `MAX_CHAT`, `DEFAULT_POPOUT`, …) and keeps the richer client-side `ChatLayout` (minimized / `stashEdge` / `lastStashEdge` / icon) plus its clamp/normalize/persist helpers. Both the docked and popout chat surfaces share one `ChatWindowControls` cluster (`apps/web/app/play/[gameId]/chat-window-controls.tsx`) - macOS-style traffic lights where red stashes the chat to its last edge (`lastStashEdge`), yellow minimizes to the floating icon, and green toggles popout ⇄ docked.

`AppearanceProvider` reconciles two sources of truth on mount (`apps/web/lib/appearance.tsx:88`): if signed in, the server-provided `initialPalette`/`initialMode` win and are written to localStorage; if signed out, the locally stored values are restored. `ThemePicker` (`apps/web/app/settings/theme-picker.tsx`) adds a hover-preview flourish - `onMouseEnter`/`onFocus` mutate `data-theme` directly for an instant preview, and `onMouseLeave`/`onBlur` restore the committed value from a ref (`apps/web/app/settings/theme-picker.tsx:43`), only persisting on actual click. The Appearance tab is split into its own server sub-routes - `/settings/appearance/theme` and `/settings/appearance/doodles` - that each resolve the session server-side and render the shared `AppearanceShell` (the card + the `Link`-based `AppearanceTabs` sub-nav) around the relevant picker; `/settings/appearance` `redirect`s to `…/theme`, mirroring how `settings/page.tsx` `redirect`s to `/settings/account`.

---

## One route renders every game

There are no `app/games/tic-tac-toe/` folders. Two dynamic routes plus the shared packages cover all games.

### The lobby route

`app/games/[gameType]/page.tsx` is a Server Component. It gates on `hasEngine(gameType)` (from `games-core`) → `notFound()`, then pulls the `GameDefinition` and hands its metadata + config fields to the client lobby:

```tsx
const { gameType } = await params;
if (!hasEngine(gameType)) notFound();

const def = getDefinition(gameType);
const session = await getServerSession();

return (
  <PageContainer>
    ...
    <GameLobby
      meta={def.meta}
      configFields={def.configFields ?? []}
      userId={session?.user?.id ?? null}
    />
    ...
);
```

See `apps/web/app/games/[gameType]/page.tsx:21`. Everything game-specific (display name, config schema) comes from the definition in `games-core`, so this one file works for any game ever added. (Note `params` is a `Promise` you `await` - a Next.js 16 convention; verify against `node_modules/next/dist/docs/` before relying on framework-version specifics.)

`GameLobby` (`apps/web/app/games/_shared/game-lobby.tsx`) renders the config form by mapping each `ConfigField` to a toggle/number/select control (`ConfigFieldRow`, `apps/web/app/games/_shared/game-lobby.tsx:65`), seeds form state from each field's `default`, and on "Play with a friend" opens the `ConversationPicker` (or routes to `/auth` if signed out). The config the user picks is carried as opaque data - the lobby does not understand it; the server's engine validates it against the game's Zod `configSchema`.

`ConversationPicker` (`apps/web/app/games/components/conversation-picker.tsx`) reads `conversationsAtom` and `friendsAtom` (already populated by SSR + the socket bridge - no fetch needed), and on selection emits over the socket and routes to the new game:

```tsx
const res = await emitAck<{ game: { id: string } }>(
  socket,
  CHAT_EVENTS.createGameInConversation,
  { conversationId, gameType, seatingMode, challengedUserId, config },
);
onClose();
router.push(`/play/${res.game.id}`);
```

See `apps/web/app/games/components/conversation-picker.tsx:41`. Games are created **over the socket**, never via a REST POST - the only game REST endpoints are reads (`GET /api/games/:gameId` and `GET /api/games/:gameId/series`). Note `res.game.id` is the game's public room **code** - `serializeGame` sets `GameJson.id = row.code` - so `/play/<code>` is the canonical play URL and that same code is later sent as the socket `gameId`; the internal UUID never reaches the browser.

### The play route

`app/play/[gameId]/page.tsx` is a Server Component that does the SSR fetch for a single game. The `[gameId]` segment is the game's public room **code**: it validates it with `isGameCode` (`notFound()` otherwise), `normalizeGameCode`s it, and redirects to the canonical uppercase code if they differ (`apps/web/app/play/[gameId]/page.tsx:35`–`:37`). It then requires a session (`redirect("/auth")`), fetches game + moves by that code, and - if the game is attached to a conversation - also fetches the conversation and its first page of messages so the chat can render side-by-side:

```tsx
const data = await serverFetchJson<{ game: GameJson; moves: MoveJson[] }>(
  `/api/games/${code}`,
);
if (!data) notFound();
```

See `apps/web/app/play/[gameId]/page.tsx:42`. It also resolves the **chat layout**: it reads the `CHAT_LAYOUT_COOKIE` and, when the cookie is missing/untrusted, falls back to the profile's saved `chatLayout` - passing `initialLayout` + `layoutTrusted` down so `GameChatSplit` can render docked/popout without a flash (`apps/web/app/play/[gameId]/page.tsx:65`). All of that becomes props on `PlayClient`.

`PlayClient` (`apps/web/app/play/[gameId]/play-client.tsx`) is where the data-driven rendering happens. It resolves the board component **by string** and renders it inside `<Suspense>`. The currently registered board is statically imported, so it server-renders and the `<Suspense>` never suspends for it - the boundary is there so that a *lazily*-registered board (a heavy future game) would have its skeleton fallback:

```tsx
const GameClient = getGameClient(gameType);
const GameSkeleton = getGameSkeleton(gameType);
const { socket } = useSocket();
const status = useAtomValue(socketStatusAtom);

const connected = status === "connected";
const gameNode = useMemo(
  () =>
    GameClient ? (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col p-4">
        <Suspense fallback={<GameSkeleton />}>
          <GameClient
            gameId={gameId}
            userId={userId}
            socket={socket}
            connected={connected}
            initialGame={initialGame}
            initialMoves={initialMoves}
            onViewProfile={openProfile}
          />
        </Suspense>
      </div>
    ) : (
      <div className="p-6 text-center text-muted-foreground text-sm">
        This game type isn't supported here.
      </div>
    ),
  [...],
);
```

See `apps/web/app/play/[gameId]/play-client.tsx:58`. If the game belongs to a conversation it wraps the board and a `ConversationView` in a `GameChatSplit` (`apps/web/app/play/[gameId]/play-client.tsx:113`); otherwise it renders the board alone (`apps/web/app/play/[gameId]/play-client.tsx:101`).

`PlayClient` also calls `useGameAudioBridge(gameMusicSource(gameType))` once (`apps/web/app/play/[gameId]/play-client.tsx:55`), which pipes the two audio preference atoms (`gameSfxAtom` / `gameMusicAtom`) into the `games-client` `GameAudioEngine`, sets the per-game background-music source, and wires the browser-autoplay gesture unlock. The settings **gear** lives in `GameChatSplit` (it owns the chat docking state): an `absolute top-3 right-3` button that slides horizontally via a CSS transform - the `--gear-shift` custom property + `transition-transform duration-300 ease-out` applied at the `md` breakpoint (`apps/web/app/play/[gameId]/game-settings-gear.tsx:29`), no framer-motion. `GameChatSplit` drives it with `shifted={gearShifted}` and `offset={chatWidth + RESIZE_HANDLE_W}` (`apps/web/app/play/[gameId]/game-chat-split.tsx:277`), where `gearShifted = mode === "mounted" && !minimized` (`apps/web/app/play/[gameId]/game-chat-split.tsx:202`) - so the gear sits left of the docked chat and snaps back to `--gear-shift: 0px` when the chat pops out / minimizes / stashes. The button opens the audio settings modal through `useLayeredPopup`. The no-conversation branch renders a static, non-sliding gear (`shifted={false} offset={0}`). See [audio.md](./audio.md).

`getGameClient` (`packages/games-client/src/registry.ts:17`) is just a lookup table of board components (currently the eagerly-imported, SSR'd `TicTacToeGameClient`; the registry type leaves room for a `React.lazy` board to code-split a heavy future game), and `GameClientProps` (`packages/games-client/src/types.ts`) is the contract every board must accept (`gameId`, `userId`, the shared `socket` + `connected`, `initialGame`, `initialMoves`, and the optional `onViewProfile` callback). `play-client.tsx` pulls `socket` from `useSocket()` (`apps/web/app/play/[gameId]/play-client.tsx:51`) and the connection `status` from `useAtomValue(socketStatusAtom)` (`apps/web/app/play/[gameId]/play-client.tsx:52`), and passes them down so the board rides the app's single connection. `getGameSkeleton(type)` (`packages/games-client/src/registry.ts:24`) returns the board's `<Suspense>` fallback, falling back to `DefaultGameSkeleton` when a game registers no skeleton (it never returns `null`). Adding a game means adding one row each to `REGISTRY` / `SKELETON_REGISTRY` and one definition to `games-core` - **no new route, endpoint, DB table, or socket event.**

### Game-over modal & the rematch series UI

`PlayClient` also mounts a `GameOverOverlay` (`apps/web/app/play/[gameId]/game-over-overlay.tsx`) *above* `GameChatSplit` (so it floats over the board and replay toolbar) in both the with-chat and no-conversation branches (`apps/web/app/play/[gameId]/play-client.tsx:92`). The overlay is a `motion`/`AnimatePresence` modal seeded with the SSR `initialGame` that opens automatically when the game is over:

```tsx
const [open, setOpen] = useState(() => isGameOver(initialGame.status));

useSocketEvent<{ game: GameJson }>("game_state", (payload) => {
  setGame(payload.game);
  if (isGameOver(payload.game.status)) setOpen(true);
});
useSocketEvent<{ newGameId: string }>(
  CHAT_EVENTS.rematchCreated,
  (payload) => {
    setRematch((r) => ({ ...r, code: payload.newGameId }));
  },
);
```

See `apps/web/app/play/[gameId]/game-over-overlay.tsx:86`. Two open triggers: it starts open when the SSR game is already finished (`isGameOver(initialGame.status)` - the shared `@gamelobby/shared/types` guard, the revisit case), and it flips open when a live `game_state` broadcast transitions the game to `completed` / `abandoned`. It is closable; with no backdrop, a document `mousedown` listener closes it on any outside click - suppressed while a layered popup is open (`game-over-overlay.tsx:119`). The banner (`outcomeLabel`, `:27`) is derived from `game.winner` vs the viewer's `userId` (You won! 🎉 / You lost / It's a draw / Game abandoned).

When the modal is open and the game is over it fetches `GET /api/games/:gameId/series` into a `SeriesDetail` (`game-over-overlay.tsx:108`). The scoreboard and **View series** only appear for a series of ≥ 2 games (`showSeries = (detail?.score.totalGames ?? 0) >= 2`, `:133`) - finishing the very first game shows just the banner + Rematch + Close. **Rematch** (shown only to a player of a `completed` game that has a conversation, `canRematch`, `:131`) `emitAck`s `CHAT_EVENTS.rematch` and routes to `/play/<newCode>`; if a `rematchCreated` event already arrived (the opponent started it), the button reads **Go to rematch** and just navigates to the captured `rematch.code` (`:188`). **View series** opens the `SeriesDetailModal` through `useLayeredPopup`'s `openLayer`. Spectators see the outcome (and scoreboard, if a series) but no action.

Two shared components back the series UI, both in `apps/web/components/games/`:

- **`SeriesScoreboard`** (`series-scoreboard.tsx`) lays out each player's `Character` avatar over their win count (wrapping past two players) plus a `draws: N` line when there are draws. It is reused by the game-over modal, the series modal, and the chat game card.
- **`SeriesDetailModal`** (`series-detail-modal.tsx`) fetches the same `/api/games/:gameId/series` endpoint and renders the scoreboard above a list of every game in the series - each row a `next/link` to `/play/<code>` (replay for finished games, resume/spectate for the live one).

The **chat game card** (`apps/web/app/chat/[handle]/game-card-message.tsx`) reads the `seriesScore` already merged into its `GameCardMeta` (no fetch needed) and, once `seriesScore.totalGames >= 2`, renders the `SeriesScoreboard` plus a **View series** button (opening `SeriesDetailModal` via `openLayer`) and - when the card's game is `completed` and you're a player - a **Rematch** button that `emitAck`s `CHAT_EVENTS.rematch` and routes to the new game (`game-card-message.tsx:40`/`:69`). The server enforces one live game per `(conversation, gameType)`, so a duplicate "new game" / double-Rematch just converges on the existing live game (see [server-api.md](./server-api.md)).

### Two skeletons: the board fallback vs. the route loading

There are two distinct skeletons, at two different boundaries - don't conflate them:

- **Board fallback** - `getGameSkeleton(gameType)` is the `<Suspense fallback>` for the board *inside* `PlayClient` (`apps/web/app/play/[gameId]/play-client.tsx:62`). It only renders for a board registered with `React.lazy` (covering the gap while that board's chunk loads); the currently registered board is statically imported and SSRs, so this fallback never appears for it. It remains required - every game must ship a skeleton - and matters the moment a heavy future game is registered lazily.
- **Route loading** - `app/play/[gameId]/loading.tsx` is the App Router `loading.tsx`; Next.js shows it while the `page.tsx` Server Component is still awaiting its SSR fetch. It is unaffected by the eager-vs-lazy board distinction. It reads the chat-layout cookie and renders `<PlaySkeleton layout={parseChatLayoutCookie(cookie)} />` (`apps/web/app/play/[gameId]/loading.tsx:7`).

`PlaySkeleton` (`apps/web/app/play/[gameId]/play-skeleton.tsx:133`) is **layout-aware**: it mirrors the real `GameChatSplit` so the loading shell matches where the chat will actually land. It branches on the parsed `ChatLayout` - a **docked** sidebar (`mode === "mounted"`, sized to `layout.chatWidth`), a fixed **popout** window (`mode === "popout"`, positioned via `popoutStyle` clamped to the viewport), or a **minimized** floating icon / edge tab (`MinimizedSkeleton`, honoring `layout.stashEdge`) - all driven by the same geometry constants from `lib/chat-layout.ts` (`ICON_SIZE`, `EDGE_TAB_*`, `POPOUT_MARGIN`). Because the cookie is mirrored from `localStorage` by `CHAT_LAYOUT_BOOT_SCRIPT` (`apps/web/lib/chat-layout.ts:215`), the server can read the user's last layout and the skeleton lands in the right place without a flash.

### Why this design

The reason one route can render every game is that the *boundary* between web and the rest of the system is data, not code paths. The lobby route knows nothing about tic-tac-toe; it asks `games-core` "what config does this game take?" and renders generic controls. The play route knows nothing about tic-tac-toe rules; it asks `games-client` "give me the board component for this type" and hands it server-fetched state. The actual rules live once, in `games-core`, and are enforced authoritatively on the server. The browser is a renderer over a contract.

---

## Data-flow walkthrough: making a tic-tac-toe move

This traces a single move from click to confirmed render, and shows exactly where "the client is never trusted" bites.

1. **User clicks a cell.** `TicTacToeGameClient` only allows it when `canMove` is true - it is the player's turn for their role and the game is `active` (`packages/games-client/src/games/tic-tac-toe/client.tsx:314`).
2. **Client emits.** `makeMove` emits over the **shared** socket (`props.socket`) - `socket.emit("make_move", { gameId, moveData: { row, col } })`. The client does **not** mutate its board itself here; it waits for the server.
3. **Server validates against the shared schema + engine.** The game lane's `make_move` handler validates the payload with the `games-core` Zod `moveSchema`, loads the stored state, re-runs the engine's `reduce`, and rejects illegal moves. This is the trust boundary: the same engine that told the client `canMove` is the one that *decides*, and it would reject a forged move from a tampered client. (See `./realtime.md` and `./games-core-engine.md`.)
4. **Server persists + broadcasts.** It persists the move and broadcasts the new canonical state to the game room.
5. **Client receives `game_state`.** The board listens for `"game_state"` and, in the post-move case, the payload carries `{ game, move }` (the full game plus the single new move delta); the board `setGame`s the record and appends the move (`packages/games-client/src/games/tic-tac-toe/client.tsx:269`). This overwrites whatever the client believed.

So the arrow is: **cell click → `client.tsx:320` `socket.emit("make_move")` → server game lane (Zod-validate + engine `reduce` + persist) → broadcast `game_state` → `client.tsx:269` `setGame`/append move → React re-renders the board.** The web app never decides the outcome; it requests one and renders the answer.

The same shape governs chat: composer optimistically inserts a `pending` message with a `clientId` → emits → server validates/persists → broadcasts `messageNew` → `ChatSocketBridge` calls `upsertMessage`, which finds the pending row by `clientId` and swaps in the confirmed one.

---

## SSR → hydrate → live, in one diagram

For any authenticated page, the lifecycle is consistent:

```
Server Component (e.g. layout.tsx / play/page.tsx)
  -> serverFetchJson(...) with forwarded cookies        [correct, personalized HTML]
  -> passes results as initial* props
        |
        v
Client boundary (AppShellClient / PlayClient / ConversationView)
  -> useHydrateAtoms(initial*)                            [atoms seeded once]
        |
        v
SocketProvider connection + useSocketEvent handlers
  -> store.set(...) on every server event                [live, ongoing]
```

`ConversationView` (`apps/web/app/chat/[handle]/conversation-view.tsx`) is a compact example of the client half: it hydrates the per-conversation messages atom from reversed SSR messages (`apps/web/app/chat/[handle]/conversation-view.tsx:46`), reads live conversation state from `conversationsAtom`, sets/clears `activeConversationIdAtom` on mount/unmount (`:67`), and emits `markRead` via `emitAck` whenever the last non-pending message changes (`:77`).

---

## transpilePackages and the Tailwind `@source`

Two small but easy-to-trip-over config facts let the shared packages work in the web app.

`next.config.ts` lists the workspace packages in `transpilePackages` (`apps/web/next.config.ts:5`) - now **three**: `@gamelobby/shared`, `@gamelobby/games-core`, and `@gamelobby/games-client`. Because they are shipped as raw TypeScript via `workspace:*` (not pre-compiled), Next must transpile them as part of the web build. `@gamelobby/shared` was added to the list when the chat/game/appearance contracts moved into it; omit any one and you get cryptic "unexpected token" errors importing the package.

`globals.css` adds `@source "../../../packages/games-client/src/**/*.{ts,tsx}"` (`apps/web/app/globals.css:3`). Tailwind v4 only generates the utility classes it sees referenced in scanned files. The game board components live *outside* `apps/web`, so without this `@source` Tailwind would purge every class used only in `games-client` (e.g. the board cells), and the game UI would render unstyled. The `@source` tells Tailwind to also scan the package's source.

---

## Gotchas, invariants & conventions

- **Never import `lib/api-server.ts` into a Client Component.** It is `server-only` and will hard-fail the build. From client code use `clientFetch*`.
- **`serverFetchJson` returns `null` on failure; `clientFetchJson` throws.** Server pages branch to `notFound()`/`redirect()`; client callers `try/catch`. Don't assume one behaves like the other.
- **`API_URL` (server) vs `NEXT_PUBLIC_API_URL` (client) are different vars on purpose.** Only `NEXT_PUBLIC_*` is exposed to the browser bundle. New env vars must also be declared in `turbo.json` `globalEnv` or builds won't see them (see CLAUDE.md / `.env`).
- **Shared = atom, private = `useState`.** If two components (or a component and the socket bridge) touch a value, make it a Jotai atom in `lib/chat/atoms.ts` or `lib/sidebar-atoms.ts`. `mobileOpen` in `app-shell.tsx` and form drafts in `game-lobby.tsx` are correct uses of `useState`.
- **The socket bridge hydrates atoms exactly once.** `useHydrateAtoms` runs on first render only; subsequent updates must come through socket events / `store.set`, not by re-hydrating.
- **`useSocketEvent` keeps the handler in a ref.** Pass any closure you like; it always calls the latest one without re-subscribing. Do not memoize the handler to "fix" subscriptions - it's already handled.
- **`emitAck` rejects on `{ ok: false }`.** Wrap socket actions in `try/catch`; a thrown error means the server refused (validation, permission, etc.).
- **Games are created/rematched over the socket, read over REST.** The game REST endpoints are reads only - `GET /api/games/:gameId` (the game + moves, used by SSR in `play/page.tsx`) and `GET /api/games/:gameId/series` (the rematch series, fetched by the game-over modal and `SeriesDetailModal`). Creation goes through `emitAck(..., CHAT_EVENTS.createGameInConversation, ...)` and rematch through `emitAck(..., CHAT_EVENTS.rematch, { gameId })`.
- **The game-over modal mounts above the board, not inside it.** `GameOverOverlay` lives in `play-client.tsx` (not in a game's board), so every game gets the same outcome/rematch/series experience for free. It auto-opens on a `completed`/`abandoned` transition and on revisit of an already-finished game; the series scoreboard + View series appear only when the series has ≥ 2 games.
- **Per-game UI lives in `games-client`, not in `apps/web`.** The play route renders whatever `getGameClient(type)` returns inside `<Suspense>`. To add a game, register it in `packages/games-client/src/registry.ts` and define it in `games-core` - do **not** add a web route.
- **If a new game's classes vanish in production CSS,** check the `@source` in `globals.css` covers where those classes are authored.
- **`params` and `cookies()` are awaited.** This Next.js version treats route `params` as a `Promise` and `cookies()` as async (`apps/web/app/play/[gameId]/page.tsx:34`, `apps/web/lib/api-server.ts:13`). Per AGENTS.md, consult `node_modules/next/dist/docs/` before writing Next-specific code rather than assuming older-version behavior.
- **`suppressHydrationWarning` on `<html>` is intentional.** The boot scripts mutate the DOM before hydration; the attribute prevents false hydration mismatch warnings. Don't remove it.
- **The game board reuses the *shared* socket.** `play-client.tsx` reads `socket` from `useSocket()` and the connection `status` from `socketStatusAtom`, and passes them into the board as `GameClientProps.socket`/`connected`; `TicTacToeGameClient` rides that one connection for the game lane (`join_room`/`make_move`/`leave_room`) instead of opening its own `io()`. A board must never call `io()` or `socket.disconnect()` - the host's `SocketProvider` owns the connection's lifecycle.
- **Two skeletons, two boundaries.** `getGameSkeleton(type)` is the board's `<Suspense>` fallback inside `PlayClient` - it only renders for a board registered with `React.lazy` (chunk load); the current board is statically imported and SSRs, so its fallback never shows. `app/play/[gameId]/loading.tsx` is the route-level App Router loading UI (SSR fetch in flight) and renders the layout-aware `PlaySkeleton` regardless. Don't reach for one when you mean the other. The board skeleton is still required for every game, and `getGameSkeleton` never returns `null` (falls back to `DefaultGameSkeleton`).
- **The play loading skeleton mirrors `GameChatSplit` via the layout cookie.** `loading.tsx` reads `CHAT_LAYOUT_COOKIE` (mirrored from `localStorage` by `CHAT_LAYOUT_BOOT_SCRIPT`) and `PlaySkeleton` branches on docked/popout/minimized so the shell lands where the chat will. If you change `GameChatSplit`'s layout modes or the geometry constants in `lib/chat-layout.ts`, update `play-skeleton.tsx` to match or the loading state will visibly jump.

---

## Where to go next

- [Architecture overview](./README.md) - the system map and the shared-logic core insight; start here if you haven't.
- [Realtime (Socket.IO lanes)](./realtime.md) - what happens on the server when this app emits `make_move` / `createGameInConversation`; the chat and game lanes.
- [Server API](./server-api.md) - the Hono routes behind every `serverFetch`/`clientFetch` path (`/api/profiles/me`, `/api/conversations`, `/api/games/:id`, …).
- [Auth](./auth.md) - Better Auth sessions and how the cookie that `serverFetch` forwards / the socket sends gets validated.
- [games-core schemas](./games-core-schemas.md) - the strict Zod `configSchema`/`moveSchema` the lobby form and move emits are validated against.
- [games-core engine](./games-core-engine.md) - the authoritative `reduce`/`step` that decides the move outcome the board renders.
- [games-client](./games-client.md) - the board components, the `getGameClient` registry, and `GameClientProps`.
- [audio](./audio.md) - the game-sound/background-music engine, the preference atoms + bridge, and the sliding settings gear over the layered-popup modal.
- [chat-core](./chat-core.md) - the `CHAT_EVENTS` contract and DTOs (`ConversationJson`, `MessageJson`, …) this app consumes.
- [Database](./database.md) - the generic `game` / `move` / `game_player` tables the SSR reads ultimately resolve to.
