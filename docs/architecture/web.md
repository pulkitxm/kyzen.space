# Web App: Next.js App Router, Data Fetching, Jotai & Game Rendering

## What this is / why it matters

`apps/web` is the Next.js 16 (React 19, App Router) frontend for the Kyzen. The default runtime mounts it on the same HTTP server as the API and realtime handlers. It is the frontend the browser renders, but it is **not** where the truth lives: the real-time state, the authoritative game engine, and the persistent data all live in `apps/server` and the shared `packages/`. The web app's job is to be a fast, well-hydrated *view* over that truth, plus a thin shell of optimistic UI that the server is free to correct.

A few load-bearing ideas make this whole app comprehensible. Understand these four and the rest falls into place:

1. **Two fetch paths, never mixed.** Server Components fetch through `lib/api-server.ts` (cookie-forwarding, `cache: "no-store"`, hits the runtime `APP_URL` service binding on Vercel or `API_URL` locally); Client Components fetch through `lib/api-client.ts` (`credentials: "include"`, hits `NEXT_PUBLIC_API_URL`). The split exists because RSC runs on the Node side where there is no browser cookie jar, and client code runs in the browser where there are no Next request headers.
2. **SSR hydrates, the socket takes over.** Every server page does one initial authenticated fetch and passes the result down as `initial*` props. The chat bridge seeds Jotai atoms once, while the play shell seeds its mounted game session. One Socket.IO connection then supplies live updates to both. The first paint is correct and personalized; everything after is live.
3. **Jotai-first application state.** State shared across features is a Jotai atom (`lib/chat/atoms.ts`, `lib/sidebar-atoms.ts`). Private UI state stays local. A mounted game session owns state in its shell and passes it to the board and overlays.
4. **One route renders every game.** There are no per-game folders. `app/games/[gameType]/page.tsx` and `app/play/[gameId]/play-client.tsx` are data-driven by `listGameMeta()` / `getDefinition()` (from `games-core`) and `getGameClient()` (from `games-client`). Adding a game touches packages, not routes.

The deeper *why* behind all of it: **the same engine and Zod schemas that inform the client also authoritatively validate moves on the server, so the client is never trusted.** The web app can render an optimistic board, but the server re-runs the engine on every move and broadcasts the canonical state back. That is why the client code below is comfortable being "wrong" briefly - it knows a `game_state` broadcast will overwrite anything it guessed.

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `apps/web/app/layout.tsx` | Root Server Component; one authenticated fan-out fetch, sets `<html>` theme/pattern attrs, injects no-flash boot scripts, threads an `isAnonymous` flag, wraps everything in `Providers` + `AppShellClient`. |
| `apps/web/app/providers.tsx` | Client wrapper: `next-themes` `ThemeProvider` (light/dark) + `AppearanceProvider` (palette/pattern/glass). |
| `apps/web/app/app-shell.tsx` | Client shell: Jotai `Provider`, `AppearanceSync`, `SocketProvider`, `GuestNudge`, `MergeConsent`, `ChatSocketBridge`, sidebar + `<main>`. |
| `apps/web/app/page.tsx` | Home grid of games, rendered from `listGameMeta()`. |
| `apps/web/app/sidebar.tsx` | The collapsible, resizable left rail rendered by `AppShellClient` (logo, nav, `SidebarSocialNav`, profile/avatar entry); persists collapsed/width via the sidebar atoms + cookie. |
| `apps/web/app/sidebar-social-nav.tsx` | The "Social" nav cluster in the sidebar (the Chat link with its `totalUnreadAtom` badge; Friends now lives in the profile page's overflow menu, not here). |
| `apps/web/app/[username]/page.tsx` | Catch-all `/[username]` profile route (Server Component): resolves the handle, fetches the profile + activity, renders `ProfilePageView`. Shadowed by `RESERVED` segments / `RESERVED_USERNAMES`. |
| `apps/web/app/[username]/profile-ui.tsx` | Client profile UI: header, stats, activity feed, and the overflow menu that now hosts the Friends entry. |
| `apps/web/lib/api-server.ts` | `server-only` `serverFetch` / `serverFetchJson`: forwards cookies, `cache: "no-store"`, uses the runtime `APP_URL` binding on Vercel, or `API_URL` and the local combined server for host development. |
| `apps/web/lib/api-client.ts` | `"use client"` `clientFetch` / `clientFetchJson`: `credentials: "include"`, uses `NEXT_PUBLIC_API_URL` when configured, otherwise same-origin paths. |
| `apps/web/lib/get-server-session.ts` | `cache()`-wrapped `serverFetchJson("/api/auth/get-session")`; one session lookup per request. The session user carries an optional `isAnonymous` (a guest is still a real session). |
| `apps/web/lib/auth-client.ts` | Better Auth React client with the `anonymousClient()` plugin (`signIn.social`, `signIn.anonymous`), pointed at `NEXT_PUBLIC_API_URL`. |
| `apps/web/lib/auth/ensure-identity.ts` | `ensureIdentity()`: if `authClient.getSession()` has no session, mints a guest one via `authClient.signIn.anonymous()`. |
| `apps/web/app/auth/guest-button.tsx` | `"use client"` "Continue as a guest" button: `ensureIdentity()` then `router.push("/")` + `router.refresh()`. |
| `apps/web/app/guest-nudge.tsx` | `"use client"` fixed "Welcome back!" prompt (the shell only mounts it for an anonymous session); derives its own show/snooze decision from `decideGuestNudge` (`lib/guest-nudge.ts`) via `useSyncExternalStore` + localStorage (`gl:guest-seen` / `gl:guest-nudge-snooze`), and renders a Google `signIn.social` button. |
| `apps/web/app/merge-consent.tsx` | `"use client"` `MergeConsent` (controller) + `MergeConsentDialog` (the fixed counts-only consent card): when `enabled` (signed in and **not** anonymous) it checks `GET /api/account/merge/pending` once on mount and offers Merge / Discard, then `router.refresh()`. |
| `apps/web/lib/account-merge.ts` | `"use client"` merge client over `clientFetchJson`: `getPendingMerge()`, `confirmMerge(id)`, `discardMerge(id)`, plus the `PendingMerge` / `MergeSummary` types. |
| `apps/web/lib/socket/socket-context.tsx` | `SocketProvider`, `useSocket`, `useSocketEvent`, `emitAck`: one shared Socket.IO connection + ack-promise helper. |
| `apps/web/app/chat-socket-bridge.tsx` | Hydrates chat atoms from SSR props, then maps every `CHAT_EVENTS.*` socket event onto a Jotai store mutation. |
| `apps/web/lib/chat/atoms.ts` | Shared chat state: conversations, messages (atomFamily), friends, requests, notifications, presence, typing, derived totals, pure upsert helpers. |
| `apps/web/lib/sidebar-atoms.ts` | `atomWithStorage` atoms for sidebar collapsed/width, with SSR-safe and width-clamping storage adapters. |
| `apps/web/lib/audio/atoms.ts` | `gameSfxAtom` / `gameMusicAtom` (`atomWithStorage`): the two client-only audio preference channels (volume + mute), seeded from `@kyzen/shared` defaults. |
| `apps/web/lib/audio/use-audio-bridge.ts` | `useGameAudioBridge()`: pushes the audio atoms into the `games-client` `GameAudioEngine`, marks music active for the play screen, and registers the gesture unlock. |
| `apps/web/app/play/[gameId]/game-settings-gear.tsx` | The sliding `FaGear` button (CSS `--gear-shift` transform, driven by `shifted`/`offset` props) that opens the settings modal via the layered-popup host. |
| `apps/web/app/play/[gameId]/game-settings-panel.tsx` | Settings modal body: per-channel mute toggle + −/+ + range slider for game sound and background music. |
| `apps/web/lib/sidebar-atoms-shared.ts` | Storage keys + `clampWidth` / `clampWidthSafe` helpers shared by the atoms and the cookie/boot-script machinery. |
| `apps/web/lib/sidebar-prefs.ts` | `SIDEBAR_PREFS_COOKIE` + `SIDEBAR_LS_BOOT_SCRIPT` + `parseSidebarPrefsCookieValue` / `persistSidebarPrefsToCookie`: the cookie contract and the no-flash boot script the layout injects. |
| `apps/web/lib/appearance.tsx` | `AppearanceProvider` (server-state context) + `AppearanceSync` (applies `data-*` attrs, reconciles server values) + `usePalette`/`usePattern`/`useGlassMode`/`useColorModeSetting`; persists appearance via `clientFetch` PUT. |
| `apps/web/lib/appearance-atoms.ts` | `paletteAtom`/`patternAtom`/`glassAtom` - localStorage-backed Jotai atoms (raw-string storage matching the boot scripts) that sync across tabs via storage events. |
| `apps/web/lib/glass.ts` | Liquid Glass shim: re-exports the shared glass catalog + `applyGlass` (sets/removes `data-glass`) + `GLASS_BOOT_SCRIPT`. |
| `apps/web/lib/glass-lens.ts` | Pure refraction math: rounded-rect SDF + `computeLensDisplacementPixels` (the displacement map the lens filters consume). |
| `apps/web/components/glass/liquid-glass.tsx` | `useLiquidLens` - Chromium-only progressive enhancement that builds per-size SVG displacement filters (with chromatic aberration) and applies `backdrop-filter: url(#…)` to floating surfaces. |
| `apps/web/components/glass/glass-pane.tsx` | The popup building blocks: `GlassPane` (div) / `GlassMotionPane` (`m.div`) render a `.glass-pane` with the lens attached, and `useGlassPaneRef` does the same for primitives that can't be wrapped (Radix popover content). New popups should use these and get glass for free. |
| `apps/web/app/games/[gameType]/page.tsx` | The single dynamic game page (Server Component): `hasEngine` gate + `getDefinition`, then a left-aligned hero (category eyebrow from `GAME_CATEGORIES`, game name, `meta.description` + a static "play a quick match or set up a room" tagline) over a two-column `lg:` grid - cover image + `RoomActions` on the left, the `HowToPlay` panel on the right (stacked below on mobile). |
| `apps/web/app/games/_shared/room-actions.tsx` | `RoomActions` (client): a full-width **Play now** button, a "Play with friends" section label, and equal-width **Create room** / **Join by code** buttons. Play now → `/play/find/<type>`, Create room → `/play/new/<type>`, Join by code validates the code (`normalizeGameCode` / `isGameCode`) then `emitAck("room:join", { code })` and routes to `/play/<code>` on success or shows an inline typed error. Each action calls `ensureIdentity()` first. |
| `apps/web/app/games/_shared/how-to-play.tsx` | `HowToPlay` (Server Component): the arcade instruction panel - a centered `font-game-paused` "How to play" header, the numbered `meta.howToPlay` steps with outlined number chips, a hairline divider, and the `TutorialButton` as its footer. Renders only when the meta has steps or a tutorial video. |
| `apps/web/app/games/_shared/tutorial-button.tsx` | `TutorialButton`: the full-width "Watch tutorial" button in the `HowToPlay` card footer that lazily mounts `TutorialModal` on click. Rendered only when `meta.tutorialVideo` is set. |
| `apps/web/app/games/_shared/tutorial-modal.tsx` | `TutorialModal`: a chrome-less framer-motion lightbox - just the video with a floating close button above it (no title bar) - that dynamically imports `plyr` and attaches a Plyr player (no mute toggle; the volume slider remains) to a `<video>` streaming the local mp4 (`meta.tutorialVideo`); destroys the player and removes the Escape listener on close. |
| `apps/web/app/play/find/[gameType]/{page,find-client}.tsx` | The matchmaking **searching** route: when the definition lists `queues`, `FindClient` first asks for a match type (`?queue=<id>` preselects one, a single queue is chosen automatically) and keeps the other types switchable while searching. It emits `game:queue_join { gameType, config? }` with the selected queue's config (switching re-joins, which replaces the ticket), shows the `SearchingScreen` with an elapsed timer, navigates on `match_found` (`router.replace("/play/<gameId>")`), renews its queue lease every 10 seconds, recovers assigned games on reconnect, and acknowledges cancellation before navigating. |
| `apps/web/app/play/new/[gameType]/{page,new-client}.tsx` | The **create-a-room** route: `NewClient` emits `room:create { gameType }` once, then `router.replace("/play/<code>")` on the ack (or shows the error in a `SearchingScreen`). |
| `apps/web/app/play/_shared/searching-screen.tsx` | `SearchingScreen`: the shared full-screen "finding/creating…" UI - a pulsing spinner (framer-motion), title/subtitle, optional children (the queue switcher), and a Cancel/Back button - reused by both the find and new routes. |
| `apps/web/app/play/[gameId]/waiting-overlay.tsx` | `WaitingForOpponentOverlay`: shown while `status === "waiting"`; renders the room **code** + Copy code / Copy link (`invite-code.tsx`), or `LobbyPanel` for engines with `lobby`, and flashes a "Game ready!" transition (framer-motion) when the game flips to `active`. |
| `apps/web/app/play/[gameId]/lobby-panel.tsx` | `LobbyPanel`: invite code, seated humans, free-for-all/teams toggle, per-participant team selects, bots (difficulty, team, remove), and Start. Only `game.creatorUserId` edits: each edit emits `room:configure` with the full config (lobby part validated by `lobbyConfigSchema`, other config keys preserved) and Start emits `room:start`; ack errors render inline. Others see the same lobby read-only with "Waiting for the host to start". Pure editing helpers live in `lib/games/lobby-config.ts` and mirror the server's team balancing. |
| `packages/games-client/src/ui/countdown-ring.tsx` | `CountdownRing`: the decorative SVG progress arc (`stroke-dasharray`/`stroke-dashoffset`, linear easing) wrapped around the active player's avatar in the board's player bar; depletes from full to empty over `turnDeadline - now`. |
| `apps/web/lib/auth/ensure-identity.ts` | `ensureIdentity()`: lazily mints an anonymous account (`authClient.signIn.anonymous()`) only when the user has no session - called by every Play now / Create room / Join by code action. |
| `apps/web/lib/matchmaking-atoms.ts` | `matchmakingAtom`: a single Jotai atom holding `{ searching: gameType | null }` so the searching state survives a re-render while a match is being found. |
| `apps/web/app/games/[gameType]/[gameId]/page.tsx` | Legacy redirect: `/games/<type>/<id>` → `/play/<id>` (the `[gameId]` segment is now a room code, passed straight through). |
| `apps/web/app/play/[gameId]/page.tsx` | SSR-fetches game + moves (+ conversation + messages), gates on auth + game **code** (`isGameCode`, then normalizes and redirects to the canonical uppercase code), resolves the chat layout, renders `PlayClient`. |
| `apps/web/app/play/[gameId]/play-client.tsx` | Resolves `getGameClient` / `getGameSkeleton`, renders the board in `<Suspense>` with the shared game session (the skeleton while `gameState` is null, as in a waiting lobby), picks the chat panel with `chatPanelMode` (conversation, match chat, or none), and mounts the waiting and `GameOverOverlay` overlays above it. Definitions with `layout: "wide"` drop the `max-w-2xl` column so the board fills the game area in every chat mode. |
| `apps/web/app/play/[gameId]/game-over-overlay.tsx` | The game-over popup (chess.com-style): auto-opens on completion / abandon (and on revisit of a finished game), shows the outcome from `GameJson.winners` (You won / Your team won / It's a draw / You lost, or the winners' names for spectators; `lib/games/outcome.ts`) and every player in a wrapping, scrollable row with all winners highlighted and bots shown with a robot icon (or the `SeriesScoreboard` for a series of ≥ 2), and offers Play again (public matches, back to the same queue) / Rematch / Go to rematch / Chat (back to the conversation via its friendly URL) / View series / Close. It is **non-blocking** - no backdrop, zero shadow, the container is `pointer-events-none` so the sidebar/chat/settings stay clickable, and a document `mousedown` listener closes it on any outside click (suppressed while a layered popup is open). |
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
| `apps/web/app/settings/appearance/{theme,doodles,glass}/page.tsx` | Appearance sub-routes (Server Components): each resolves the session and renders `AppearanceShell` around the `ThemePicker` / `DoodlePicker` / `GlassPicker`. |
| `apps/web/app/settings/appearance-shell.tsx` | Server shell: the Appearance card + heading + `AppearanceTabs` sub-nav, wrapping the active picker. |
| `apps/web/app/settings/appearance-tabs.tsx` | Client `Link`-based Theme \| Doodles \| Glass sub-nav; active tab from `usePathname()`. |
| `apps/web/app/settings/account-identity-form.tsx` | Client form to edit display name + username (debounced live availability check, suggestion chips, cooldown lock). |
| `apps/web/app/settings/theme-picker.tsx` | Hover-preview palette/color-mode picker driven by the appearance context. |
| `apps/web/app/settings/glass-picker.tsx` | Hover-preview Liquid Glass mode picker (Off / Neutral / Tinted / Smoke) driven by the appearance context. |
| `apps/web/next.config.ts` | `transpilePackages` for the raw-TS workspace packages (`@kyzen/shared`, `@kyzen/games-core`, `@kyzen/games-client`). |
| `apps/web/app/globals.css` | Tailwind v4 entry; `@source` so Tailwind scans games-client classes. |
| `packages/games-client/src/registry.ts` | `getGameClient(type)` maps a game type to its board component (currently the statically-imported, SSR'd `TicTacToeGameClient`; the registry type also permits a `React.lazy` board for a heavy future game); `getGameSkeleton(type)` returns its `<Suspense>` fallback (or `DefaultGameSkeleton`). |
| `packages/games-client/src/types.ts` | `GameClientProps`: the contract every game board receives (incl. the optional `onViewProfile` callback). |

---

## RSC vs. client fetch: the two-path rule

This is the first thing to internalize because it explains every "why is there a server version and a client version" question.

`lib/api-server.ts` is marked `import "server-only"`, which makes the bundler throw a build error if a Client Component ever imports it. It reads the incoming request's cookies via `next/headers` and forwards them to the backend, so the backend's Better Auth session check sees the same cookie the browser sent. It always uses `cache: "no-store"` because this is per-user, session-scoped data that must never be shared across requests:

```ts
async function serverFetch(
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

The two env vars differ deliberately. `API_URL` (server) can point at an internal/private hostname the browser can never reach; `NEXT_PUBLIC_API_URL` (client) must be a publicly routable URL. `api-server.ts` defaults to the local combined server at `127.0.0.1:<PORT>`. Browser calls default to same-origin paths.

**Rule of thumb:** if you are in a file with `"use client"` at the top (or imported only by such files), use `clientFetch*`. Otherwise (Server Component, `cache()`d helper) use `serverFetch*`. Mixing them fails fast thanks to `server-only`.

---

## The root layout: one fetch, correct first paint

`app/layout.tsx` is an `async` Server Component and the linchpin of "correct first paint." It calls `getServerSession()` once. The private `loadShellState` helper supplies empty signed-out defaults or issues **one parallel fan-out** of authenticated fetches for an authenticated user:

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

See `apps/web/app/layout.tsx:80`. Everything here becomes `initial*` props handed down to `AppShellClient`, which become the seed values for Jotai atoms. That is why a signed-in user's sidebar, unread badges, and friends list are *already correct in the server-rendered HTML* - no client loading spinner, no flash.

`getServerSession` is wrapped in React's `cache()` (`apps/web/lib/get-server-session.ts`), so even though the layout and individual pages all call it, the underlying `/api/auth/get-session` round-trip happens at most once per request. A guest counts as "signed in" here: the session it returns is a real one (its user simply carries `isAnonymous: true`), so the layout computes `isAnonymous = Boolean(session?.user?.isAnonymous)` (`apps/web/app/layout.tsx:65`), runs the same authenticated fan-out, and threads `isAnonymous` down to `AppShellClient` (`apps/web/app/layout.tsx:185`). Because of this, **the socket and chat work unchanged for guests** - nothing branches on the flag except the upgrade nudge.

The layout also sets appearance state on `<html>` from the server-known profile so there is no theme flash:

```tsx
<html
  lang="en"
  suppressHydrationWarning
  data-theme={userTheme ?? DEFAULT_THEME}
  data-pattern={userPattern ?? DEFAULT_PATTERN}
  data-glass={userGlass && userGlass !== "off" ? userGlass : undefined}
  style={patternStyle}
  className={`${geistSans.variable} ${geistMono.variable} ${gamePaused.variable} h-full antialiased`}
>
```

See `apps/web/app/layout.tsx:135`. The `style={patternStyle}` writes the `--pattern-url` / `--pattern-tile` CSS vars at SSR (from `patternVars`, `apps/web/app/layout.tsx:120`) so the doodle background lands without a flash. For *signed-out* users (whose preference lives only in `localStorage`, not on the server), five inline `dangerouslySetInnerHTML` boot scripts run before first paint to apply the stored sidebar/chat-layout/theme/pattern/glass prefs synchronously (`apps/web/app/layout.tsx:146`). `suppressHydrationWarning` is set because these scripts intentionally mutate the DOM before React hydrates. The cookie path (`SIDEBAR_PREFS_COOKIE`, read at `apps/web/app/layout.tsx:129`) lets the server pre-trust sidebar prefs it can read from the request.

### Provider stack

`Providers` (`apps/web/app/providers.tsx`) is the outermost client boundary: `next-themes` `ThemeProvider` for light/dark (`storageKey="gl-color-mode"`, `attribute="class"`) wrapping `AppearanceProvider` for palette + doodle pattern + liquid glass.

`AppShellClient` (`apps/web/app/app-shell.tsx`) nests the runtime providers in a specific order that is worth reading top-down:

```tsx
<TooltipProvider delayDuration={300}>
  <Provider>
    <AppearanceSync />
    <SocketProvider enabled={signedIn}>
      {isAnonymous ? <GuestNudge /> : null}
      <MergeConsent enabled={signedIn && !isAnonymous} />
      {signedIn && userId ? (
        <ChatSocketBridge userId={userId} initialConversations={...} ... />
      ) : null}
      ...
    </SocketProvider>
  </Provider>
</TooltipProvider>
```

See `apps/web/app/app-shell.tsx:63`. The Jotai `<Provider>` must wrap `ChatSocketBridge` (so the bridge has a store to write into) and `SocketProvider` must wrap it too (so it has a socket to listen on); `AppearanceSync` (`apps/web/app/app-shell.tsx:66`) is mounted just inside the `Provider` so it can read/write the appearance atoms. `enabled={signedIn}` means the socket only connects for authenticated users - which **includes guests**, since a guest is signed in. The shell only renders `<GuestNudge />` when the session is anonymous (`{isAnonymous ? <GuestNudge /> : null}`, `apps/web/app/app-shell.tsx:68`); the prop-less component then derives its own show/snooze decision (see below), so it is never even mounted for Google users. `<MergeConsent enabled={signedIn && !isAnonymous} />` (`apps/web/app/app-shell.tsx:69`) is the converse: it does nothing for a guest, and only for a signed-in **real** user does it check `GET /api/account/merge/pending` and surface the consent dialog when an anonymous account is waiting to be merged in (see below). The only `useState` in this file is `mobileOpen` (`apps/web/app/app-shell.tsx:57`) - a textbook case of component-private state that correctly stays out of Jotai.

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

- `useSocketEvent(event, handler)` (`apps/web/lib/socket/socket-context.tsx:77`) subscribes a component to a server event. It uses `useEffectEvent` to read the latest committed handler. The subscription effect runs when the socket or event name changes and removes the same listener during cleanup. The provider also explicitly removes its socket and manager status listeners before disconnecting.
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
- **Derived atoms for totals.** `totalUnreadAtom` (`apps/web/lib/chat/atoms.ts:47`) and `conversationUnreadAtomFamily` (`apps/web/lib/chat/atoms.ts:50`) are read-only derived atoms - the sidebar's unread badge recomputes automatically whenever `conversationsAtom` changes, with no manual bookkeeping.

The file also exports **pure** upsert helpers (`upsertMessage`, `upsertConversation`, `upsertFriend`) that take a list and return a new list. Keeping them pure and exported is the project's testability convention - they can be unit-tested without React or a store. `upsertMessage` is the reconciliation heart of optimistic sends:

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

See `apps/web/lib/chat/atoms.ts:58`. It dedupes first by the optimistic `clientId` (replacing the pending bubble with the server's authoritative row) and then by server `id`, so a message delivered both via the emit-ack and via the broadcast never doubles up.

### Storage-backed atoms (and SSR safety)

`lib/sidebar-atoms.ts` uses `atomWithStorage` so the sidebar's collapsed flag and pixel width survive reloads. The interesting part is the custom storage adapters that make this SSR-safe and self-healing. `sidebarWidthStorage.getItem` (`apps/web/lib/sidebar-atoms.ts:28`) returns the initial value when `window` is undefined (server render), clamps the stored value into `[MIN, MAX]`, and even *rewrites* localStorage if the stored value was out of range. It also implements `subscribe` (`apps/web/lib/sidebar-atoms.ts:50`) so width changes in one tab propagate to others via the `storage` event.

The clamping logic and storage keys live in `lib/sidebar-atoms-shared.ts` precisely so they can be imported by *both* the client atoms and the cookie/boot-script machinery in `lib/sidebar-prefs.ts` - the same `clampWidth` invariant is enforced before paint (the `SIDEBAR_LS_BOOT_SCRIPT`, `apps/web/lib/sidebar-prefs.ts:69`) and at runtime (atom). `lib/sidebar-prefs.ts` also owns the `SIDEBAR_PREFS_COOKIE` and its parse/persist helpers; `layout.tsx` imports the boot script and the cookie parser (`apps/web/app/layout.tsx:24`–`:28`) and renders the script in `<head>`. This shared-helper split is the same logic-reuse instinct as the packages, applied within the web app.

---

## Appearance: theme, palette, pattern, glass

Appearance is split across three layers, and which layer owns what is the key to understanding it:

- **Color mode (light/dark/system)** is owned by `next-themes` (`apps/web/app/providers.tsx:35`), toggling a `class` on `<html>` with `storageKey="gl-color-mode"`.
- **Palette** (named color schemes), **pattern** (background doodles), and **glass** are owned by localStorage-backed Jotai atoms (`apps/web/lib/appearance-atoms.ts`), stored as raw strings under the same keys the boot scripts read and **synced across tabs** via storage events; `AppearanceSync` (mounted inside the app shell's Jotai `Provider`) applies the `data-theme` / `data-pattern` / `data-glass` attributes on `<html>` in effects whenever an atom changes - whether from a local click or another tab. The pattern effect calls `applyPattern` (`apps/web/lib/patterns.ts`), which - besides the `data-pattern` attribute - writes the `--pattern-url` / `--pattern-tile` CSS custom properties **inline on `<html>`** straight from the `PATTERNS` catalog. The single `.app-canvas::before` rule in `globals.css` masks the page with those vars (`mask: var(--pattern-url) repeat; mask-size: var(--pattern-tile)`), so adding a pattern is purely a data change (a `PATTERNS` entry + its generated SVG, produced by `apps/web/scripts/gen-pattern-tiles.ts` from Lucide icons as seamless edge-wrapped tiles) with **no per-pattern CSS** - the same `applyPattern` helper drives the provider effect, the picker's hover preview, and the inline boot script, and `layout.tsx` sets the same vars at SSR via `patternVars` to avoid a flash.
- **Persistence** for signed-in users goes back to the server via `clientFetch` PUT to `/api/profiles/me/appearance` (`apps/web/lib/appearance.tsx:36`) - note this is a *client* fetch because it fires from a click handler.
- **Catalogs & helpers** - the palette/pattern *display* tables (`THEMES` / `PATTERNS` with their color/preview data) and lookups (`getThemeDef` / `getPatternDef`) now live in `@kyzen/shared/constants`. `apps/web/lib/themes.ts` and `apps/web/lib/patterns.ts` **re-export that shared core** - the display tables, the id catalogs, and the guards (`THEMES` / `THEME_IDS` / `DEFAULT_THEME` / `isValidTheme` from `apps/web/lib/themes.ts:3`; `PATTERNS` / `PATTERN_IDS` / `DEFAULT_PATTERN` / `getPatternDef` / `isValidPattern` from `apps/web/lib/patterns.ts:10`) - and add only the web-only runtime shims on top: the SSR boot scripts (`PALETTE_BOOT_SCRIPT` at `apps/web/lib/themes.ts:17`, `PATTERN_BOOT_SCRIPT` at `apps/web/lib/patterns.ts:43`) plus `patternVars` / `applyPattern` (`apps/web/lib/patterns.ts:19`). `getThemeDef` is consumed straight from `@kyzen/shared/constants` (`themes.ts` re-exports the palette catalog but not that lookup). So the client and server agree on the *catalog and valid set* (one source of truth in `@kyzen/shared`) while the browser owns only the *boot-time application*. `apps/web/lib/chat-layout.ts` follows the same pattern: it re-exports the shared `ChatMode`/geometry bounds (`MIN_CHAT`, `MAX_CHAT`, `DEFAULT_POPOUT`, …) and keeps the richer client-side `ChatLayout` (minimized / `stashEdge` / `lastStashEdge` / icon) plus its clamp/normalize/persist helpers. Both the docked and popout chat surfaces share one `ChatWindowControls` cluster (`apps/web/app/play/[gameId]/chat-window-controls.tsx`) - macOS-style traffic lights where red stashes the chat to its last edge (`lastStashEdge`), yellow minimizes to the floating icon, and green toggles popout ⇄ docked.

`AppearanceSync` reconciles two sources of truth on mount (`apps/web/lib/appearance.tsx`): if signed in, the server-provided initial values win and are written into the atoms (and so into localStorage); if signed out, the atoms initialize straight from localStorage (`getOnInit`). Color mode needs no atom - `next-themes` already persists and cross-tab-syncs it under `gl-color-mode`. `ThemePicker` (`apps/web/app/settings/theme-picker.tsx`) adds a hover-preview flourish - `onMouseEnter`/`onFocus` mutate `data-theme` directly for an instant preview, and `onMouseLeave`/`onBlur` restore the committed value from a ref (`apps/web/app/settings/theme-picker.tsx:43`), only persisting on actual click. The Appearance tab is split into its own server sub-routes - `/settings/appearance/theme`, `/settings/appearance/doodles`, and `/settings/appearance/glass` - that each resolve the session server-side and render the shared `AppearanceShell` (the card + the `Link`-based `AppearanceTabs` sub-nav) around the relevant picker; `/settings/appearance` `redirect`s to `…/theme`, mirroring how `settings/page.tsx` `redirect`s to `/settings/account`.

### Liquid Glass

**Liquid Glass** is a fourth appearance axis (`GLASS_MODES = off | neutral | tinted | smoke`, default `off`), persisted like the others (`gl-glass` in localStorage, `glass` pgEnum column on `user_profile`, `PUT /api/profiles/me/appearance`). When a mode other than `off` is active, `applyGlass` (`apps/web/lib/glass.ts`) sets `data-glass="<mode>"` on `<html>` (the attribute is *absent* when off, so all glass CSS is keyed off `html[data-glass]` and costs nothing by default). The material is layered:

- **CSS layer (all browsers)** - `globals.css` defines per-mode `--glass-*` variables (light/dark × neutral/tinted/smoke; `tinted` derives from the palette's `--v`) and two classes, both no-ops without `data-glass`: `.glass-pane` (the material - translucent background + `backdrop-filter: blur() saturate() brightness()` + offset inset rim lights + an inner shine + layered depth shadows) and `.glass-scrim` (lightens the `bg-black/*` overlay behind glass popups to `rgb(0 0 0 / 0.25)` so the backdrop stays visible through the pane). `.glass-press` (on the shared `Button`) adds the gel press states (springy `scale(0.96)` on `:active`) but only activates **inside** a `.glass-pane`. `smoke` panes locally override the text/surface custom properties so nested content stays readable on dark glass. `prefers-reduced-transparency: reduce` forces solid surfaces, and an `@supports` guard raises the background to near-solid where `backdrop-filter` is unsupported.
- **Popup surfaces get glass through shared building blocks** (`apps/web/components/glass/glass-pane.tsx`): `GlassPane` / `GlassMotionPane` render the pane with the lens attached, and `useGlassPaneRef` covers Radix content. Current consumers: the shared popover wrapper (`app/ui/popover.tsx`), layered-popup dialogs, the profile popup, the two chat dialogs, the game-over overlay, the conversation picker, the guest nudge, the account-identity confirm dialog, the avatar editor (sheet + confirm), the chat game-launcher menu, the composer emoji/GIF picker, the floating chat window (`chat-popout-window.tsx`, popout mode only - docked mode is layout chrome), and the minimized-chat floating bubble + edge tabs (`chat-floating-icon.tsx`, which swap their solid `bg-primary` for the pane material via `useGlassMode`). The sidebar is deliberately solid - glass is a popup treatment.
- **Lens layer (Chromium-only enhancement)** - `useLiquidLens` (`apps/web/components/glass/liquid-glass.tsx`) attaches real edge refraction wherever the glass-pane building blocks render. It measures the element (ResizeObserver + `offsetWidth/Height`, transform-independent), generates a rounded-rect-SDF displacement map (`apps/web/lib/glass-lens.ts`, pure and unit-tested), builds one SVG `<filter>` per unique size in a shared hidden `<svg>` (cached, LRU-capped), runs R/G/B through `feDisplacementMap` at staggered scales for chromatic aberration, and sets `backdrop-filter: url(#gl-lens-…) blur(2px) saturate(var(--glass-saturate, 170%)) brightness(var(--glass-brighten, 1.05))` inline. The hook gates on `data-glass` being active, a Chromium UA + `CSS.supports("backdrop-filter", "url(#…)")` (or the `-webkit-` form), and `prefers-reduced-transparency`; everywhere else the CSS layer simply renders without refraction.

---

## One route renders every game

`app/games/[gameType]/page.tsx` reads metadata and the generic room actions. `app/play/[gameId]/page.tsx` loads the initial game and move history, optionally loads its conversation, and keys `PlayClient` by room code.

`PlayClient` resolves the board and skeleton from the client registry. It calls `useGameSession` with the application socket and SSR data, then supplies the board with `game`, `moves`, `userId`, `connected`, `makeMove`, and `onViewProfile`. The board, overlays, and match chat all receive `game.viewerId ?? userId`, so the local player is the public alias in public matches and the account id elsewhere; the session keeps the SSR `viewerId` across shared broadcasts. `onViewProfile` is omitted in public matches and ignores bot players. The shell owns transport errors, settings, and game waiting/results. Both overlays consume the same game as the board.

Conversation-backed games mount `ConversationView` through `GameChatSplit`, which owns docked, floating, and minimized placement and saved geometry. Every other room whose viewer is a player (public matches and standalone private rooms) mounts the temporary match chat in the same split; spectators, and games whose conversation failed to load, render the board alone. Profile popups use the shared shell callback. Audio preferences are shared, while a game's background track is supplied by `GameMeta.backgroundMusic`.

The waiting overlay uses game status rather than a hardcoded player count. It becomes visible while the game is waiting and flashes a ready state when the server activates it. For engines with `lobby` it is the host-controlled lobby described above; the server keeps such games waiting until `room:start`. The result overlay opens on a terminal state or when revisiting a finished game, fetches a series when available, and offers conversation-backed rematches to players. It still listens for the separate rematch notification.

The board owns game-specific presentation. Tic-tac-toe reconstructs a position from ordered moves for its replay controls and uses server state while live. It calls the move callback and waits for the authoritative update; it does not mutate the game optimistically.

## Data flow

Initial SSR fetch -> play session joins room -> server snapshot -> board and overlays. A board action calls `makeMove` -> server validates role, schema, and rules -> persists -> broadcasts `game_state` -> shared session filters by room and merges moves -> board and overlays update together.

On reconnect the session joins again and replaces history with the full snapshot. On unmount it removes its listeners and leaves its room while preserving the application's chat connection. The route key resets the session and board UI when the room changes.

See [game boards](games-client.md), [adding a game](../adding-a-game.md), [audio](audio.md), and [deployment](../deployment.md).

## Gotchas, invariants & conventions

- **Never import `lib/api-server.ts` into a Client Component.** It is `server-only` and will hard-fail the build. From client code use `clientFetch*`.
- **`serverFetchJson` returns `null` on failure; `clientFetchJson` throws.** Server pages branch to `notFound()`/`redirect()`; client callers `try/catch`. Don't assume one behaves like the other.
- **`API_URL` (server) vs `NEXT_PUBLIC_API_URL` (client) are different vars on purpose.** Only `NEXT_PUBLIC_*` is exposed to the browser bundle. New env vars must also be declared in `turbo.json` `globalEnv` or builds won't see them (see CLAUDE.md / `.env`).
- **Shared = atom, private = `useState`.** If two components (or a component and the socket bridge) touch a value, make it a Jotai atom in `lib/chat/atoms.ts` or `lib/sidebar-atoms.ts`. `mobileOpen` in `app-shell.tsx` and the `busy` / `code` / `joinError` flags in `room-actions.tsx` are correct uses of `useState`.
- **The socket bridge hydrates atoms exactly once.** `useHydrateAtoms` runs on first render only; subsequent updates must come through socket events / `store.set`, not by re-hydrating.
- **`useSocketEvent` keeps the handler in a ref.** Pass any closure you like; it always calls the latest one without re-subscribing. Do not memoize the handler to "fix" subscriptions - it's already handled.
- **`emitAck` rejects on `{ ok: false }`.** Wrap socket actions in `try/catch`; a thrown error means the server refused (validation, permission, etc.).
- **Games are created/joined/rematched over the socket, read over REST.** The game REST endpoints are reads only - `GET /api/games/:gameId` (the game + moves, used by SSR in `play/page.tsx`) and `GET /api/games/:gameId/series` (the rematch series, fetched by the game-over modal and `SeriesDetailModal`). A standalone room is created via `emitAck(..., "room:create", { gameType })` and looked up via `emitAck(..., "room:join", { code })`; an in-chat game via `emitAck(..., CHAT_EVENTS.createGameInConversation, ...)`; rematch via `emitAck(..., CHAT_EVENTS.rematch, { gameId })`. Matchmaking (Play) uses the fire-and-forget `game:queue_join` / `match_found` events. Lobby hosts use `emitAck(..., "room:configure", { gameId, config })` and `emitAck(..., "room:start", { gameId })`.
- **Anonymous identity is minted lazily, never gated.** Play now / Create room / Join by code each call `ensureIdentity()` first, which mints an anonymous account only if there is no session - there is no login wall on the game page.
- **The game-over modal mounts above the board, not inside it.** `GameOverOverlay` lives in `play-client.tsx` (not in a game's board), so every game gets the same outcome/rematch/series experience for free. It auto-opens on a `completed`/`abandoned` transition and on revisit of an already-finished game; the series scoreboard + View series appear only when the series has ≥ 2 games.
- **Per-game UI lives in `games-client`, not in `apps/web`.** The play route renders whatever `getGameClient(type)` returns inside `<Suspense>`. To add a game, register it in `packages/games-client/src/registry.ts` and define it in `games-core` - do **not** add a web route.
- **If a new game's classes vanish in production CSS,** check the `@source` in `globals.css` covers where those classes are authored.
- **`params` and `cookies()` are awaited.** This Next.js version treats route `params` as a `Promise` and `cookies()` as async (`apps/web/app/play/[gameId]/page.tsx:34`, `apps/web/lib/api-server.ts:13`). Per AGENTS.md, consult `node_modules/next/dist/docs/` before writing Next-specific code rather than assuming older-version behavior.
- **`suppressHydrationWarning` on `<html>` is intentional.** The boot scripts mutate the DOM before hydration; the attribute prevents false hydration mismatch warnings. Don't remove it.
- **The shared game session owns the game lane.** `PlayClient` supplies the application socket to `useGameSession`, which joins, leaves, reconnects, and handles state updates. Boards receive `game`, `moves`, `userId`, `connected`, `makeMove`, and `onViewProfile`. They never receive the socket or manage its lifecycle; `SocketProvider` owns the connection.
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

## Focused client components

The sidebar keeps atom hydration and cookie persistence in `useSidebarLayout`, resize gestures and keyboard shortcuts in `useSidebarInteractions`, and header, footer, game links, and settings links in private components. Chat rendering separates the conversation header, emoji browser, message avatar, and message content from their parent shells. The waiting overlay delegates invitation controls; the result overlay delegates rematch and navigation actions.

`useGifResults` tracks loading with a request identity and whether that request appends results. Its `finally` updater clears only the matching request, so an older completion cannot stop the current spinner. Account identity dates specify both `en-US` and UTC for consistent server and browser output. Gesture refs synchronize in layout effects; socket and tutorial effect callbacks use the latest committed handlers.

## Match chat

`match-chat-panel.tsx` renders match-scoped chat inside the existing `GameChatSplit`, including docked, floating, minimized, and mobile game/chat tabs, for public matches and standalone private rooms. It opens when the game starts and ends with it. Public matches use role aliases and keep Add friend: with one opponent it is a compact header action, with more players a header toggle lists each human peer, and every request emits `match:friend { gameId, playerId }`. The `/api/matches/:code/messages` snapshot's `choices` and `friends` restore per-player state; mutual consent exposes a link to the permanent friend conversation without copying match messages. Private rooms show real usernames, open profile popups from message authors, and have no friend action. Sends never disable the input: a ref blocks overlapping sends, a failed send keeps its client id until it succeeds or the text changes, and the acknowledged message merges immediately. Retention and identity-sharing details live in a collapsed privacy disclosure.
