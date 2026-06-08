# Chat Contracts: DTOs, Schemas & Socket Events (in @gamelobby/shared)

## What this is / why it matters

There is no longer a standalone `@gamelobby/chat-core` package — its contents moved wholesale into **`@gamelobby/shared`**. The **wire contract for everything social** in GameLobby (conversations, messages, friends, notifications, presence, typing, and the embedded "game card" that lets you start a game from inside a chat) now lives under `packages/shared/src/types/chat/` (types + Zod schemas) and `packages/shared/src/constants/chat.ts` (the `CHAT_EVENTS` names), surfaced through the two subpath exports of shared (`packages/shared/package.json:6`):

1. **DTOs** (`packages/shared/src/types/chat/dto.ts`, via `@gamelobby/shared/types`) — the JSON shapes that travel over the network (`MessageJson`, `ConversationJson`, `NotificationJson`, …) plus the small string-union types (`MessageKind`, `ConversationKind`, `MemberRole`, `FriendStatus`, `NotificationType`) that the **database package's Drizzle schema** uses to type its columns.
2. **Zod schemas** (`packages/shared/src/types/chat/schemas.ts`, via `@gamelobby/shared/types`) — runtime validators for the payload that comes **from the client and therefore cannot be trusted** (`clientCreateGameInConversationSchema`) and for the JSONB blobs persisted in the DB (`gameCardMetaSchema`, `notificationPayloadSchema`).
3. **The socket contract** — a frozen map of event **names** (`CHAT_EVENTS`, in `packages/shared/src/constants/chat.ts`, via `@gamelobby/shared/constants`) plus a `Client*`/`Server*` type for every payload that flows in each direction over the chat lane of the Socket.IO connection (`packages/shared/src/types/chat/socket-events.ts`, via `@gamelobby/shared/types`).

Why does this live in a shared package instead of being defined twice? Because **both the Next.js frontend and the Bun backend import it via `workspace:*`** (`apps/web/package.json:18`, `apps/server/package.json:18`). The server builds a `MessageJson`, the client consumes a `MessageJson`, and both refer to the *same* TypeScript type and the *same* event-name constant. If a field is renamed, both sides fail to type-check in the same `bun run type-check` pass — the contract physically cannot drift. This is the chat-side mirror of the core repo insight: shared domain code lives in `packages/` and is imported by both ends, so the wire format has exactly one definition.

The chat contracts are the social counterpart to the game contracts that also live in `@gamelobby/shared/types`: the game contracts own the *game* engine interface + schemas (and the server validates moves against them so the client is never trusted), while the chat contracts own the *social* DTOs + the one client-supplied chat schema. `@gamelobby/shared` has **no React** (so the server can import it). Its only runtime deps are `zod` and `@gamelobby/avatar` (for the `AvatarConfig` type embedded in `PublicUser`) — `@gamelobby/shared` is the only package that declares `zod`. The chat schemas reuse the registry-derived `gameTypeSchema` (now also in shared, `packages/shared/src/types/games/core.ts`) so that every `gameType` field in a chat payload is validated against the actual game registry, not just "any non-empty string".

## Files at a glance

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/types/chat/dto.ts` | All chat/social JSON DTOs (`MessageJson`, `ConversationJson`, `NotificationJson`, `FriendshipJson`, `PublicUser`, …) and the string-union types reused by the DB schema (`MessageKind`, `ConversationKind`, `MemberRole`, `FriendStatus`, `NotificationType`, `SystemEvent`). |
| `packages/shared/src/types/chat/schemas.ts` | The Zod schemas: `gameCardMetaSchema` (game-card JSONB, incl. `seriesScore`), `notificationPayloadSchema` (notification JSONB), and the untrusted client payloads `clientCreateGameInConversationSchema` + `clientRematchSchema`. |
| `packages/shared/src/types/chat/socket-events.ts` | The `Client*` / `Server*` payload types and the generic `Ack`/`AckResult` helpers. (The `CHAT_EVENTS` name registry itself lives in `constants/chat.ts`.) |
| `packages/shared/src/constants/chat.ts` | `CHAT_EVENTS` — the frozen event-name registry, `as const`. Surfaced via `@gamelobby/shared/constants`. |
| `packages/shared/src/types/chat/index.ts` | Barrel that re-exports the chat types + schemas; folded into `@gamelobby/shared/types` (`packages/shared/src/types/index.ts:3`). |
| `packages/shared/package.json` | Declares `@gamelobby/shared`; the only runtime deps are `zod` and `@gamelobby/avatar`. No React. |

Key **consumers** outside the package (the contract in action):

| Path | How it uses the chat contracts |
| --- | --- |
| `packages/database/src/schema.ts` | Types JSONB/enum-ish columns with the chat unions (`MessageKind`, `MessageMetadata`, `NotificationPayload`, …) imported from `@gamelobby/shared/types`. |
| `apps/server/src/api/serialize.ts` | Turns Drizzle rows into the DTOs (`serializeMessage`, `serializeConversation`, …). |
| `apps/server/src/chat/*` | Service layer that assembles + broadcasts DTOs (`assemble.ts`, `game-card.ts`, `games-in-chat-service.ts`, `messages-service.ts`). |
| `apps/server/src/realtime/*` | Socket handlers keyed off `CHAT_EVENTS` (`chat.ts`, `games-in-chat.ts`, `notify.ts`). |
| `apps/web/lib/chat/atoms.ts`, `apps/web/app/chat-socket-bridge.tsx` | Client Jotai atoms typed as the DTOs; the bridge subscribes to `CHAT_EVENTS` and writes incoming `Server*` payloads into atoms. |

## The DTOs (`types/chat/dto.ts`)

These are plain `type` aliases — no classes, no methods. They describe the JSON that crosses the wire, and they are deliberately *serialization-ready*: every timestamp is a `string | null` (an ISO string or null), never a `Date`, because `Date` does not survive JSON. The server's serializers enforce that conversion in one place (`apps/server/src/api/serialize.ts:22`'s `iso()` helper).

### `PublicUser` — the shared identity shape

Almost every DTO embeds `PublicUser`, the safe, public projection of a user (no email, no session):

```ts
export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
};
```

`AvatarConfig` comes from `@gamelobby/avatar` (`packages/shared/src/types/chat/dto.ts:1`), so a user's avatar is described by the same DiceBear config type everywhere. `MemberJson` (`dto.ts:32`) is just `PublicUser & { role: MemberRole }`, and `SearchUserJson` (`dto.ts:24`) is `PublicUser & { friendState: FriendState }`.

### `MessageJson` and the `MessageKind` / `MessageMetadata` discriminator

A message is one row, but its meaning depends on its `kind`:

```ts
export type MessageKind = "text" | "gif" | "game_card" | "system";

export type MessageMetadata = GifMeta | GameCardMeta | SystemMeta;

export type MessageJson = {
  id: string;
  conversationId: string;
  sender: PublicUser | null;
  kind: MessageKind;
  body: string | null;
  metadata: MessageMetadata | null;
  gameId: string | null;
  createdAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
};
```

The design choice worth understanding: rather than a separate table or DTO per message type, **one `MessageJson` carries a `kind` plus a polymorphic `metadata` union** (`dto.ts:65`). A `"text"` message uses `body`; a `"gif"` carries a `GifMeta` (`dto.ts:38`); a `"game_card"` carries a `GameCardMeta` and points at a real game via `gameId` (for a serialized card this is the game's shareable **room code**, not the DB foreign key — see ["Game cards"](#game-cards-how-a-game-gets-embedded-in-a-conversation) below); a `"system"` message (member added, group renamed) carries a `SystemMeta` (`dto.ts:58`) with an `event` from the `SystemEvent` union (`dto.ts:51`) and no sender. `sender` is nullable precisely so system messages and messages from deleted users can serialize cleanly.

On the DB side this maps directly: `packages/database/src/schema.ts:244` declares the `message` table with `kind: text(...).$type<MessageKind>()` (`:254`) and `metadata: jsonb(...).$type<MessageMetadata>()` (`:256`). So **the JSONB column is statically typed by the shared chat union** — Drizzle will not let you store a metadata shape that isn't one of the three variants. (Note the table's own `gameId: uuid("game_id").references(() => game.id)` column at `schema.ts:257` is the internal **UUID** FK — distinct from the room *code* a serialized game card puts on the wire; see below.)

### `ConversationJson` and `NotificationJson`

`ConversationJson` (`dto.ts:80`) bundles a conversation with its `members: MemberJson[]`, a denormalized `lastMessage`, an `unreadCount`, and a `kind` (`"dm" | "group"`). The `name` is nullable because a DM has no stored name — the server computes the display name from "the other member" at serialize time (`apps/server/src/api/serialize.ts:116`).

`NotificationJson` (`dto.ts:100`) pairs a `NotificationType` (`dto.ts:92` — `"friend_request" | "friend_accepted" | "game_started" | "game_challenge"`) with an `actor: PublicUser | null` and a `payload: NotificationPayload`. Note the two-way reference between `dto.ts` and `schemas.ts`: the file imports the *types* of `gameCardMetaSchema` and `notificationPayloadSchema` and derives DTO members from them with `z.infer`:

```ts
export type GameCardMeta = z.infer<typeof gameCardMetaSchema>;
```

and `export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;` (`dto.ts:98`). This is the key pattern: **the Zod schema is the source of truth, the TS type is derived from it.** There is no chance of the validator and the type disagreeing, because the type *is* the validator's inferred output.

### The union types the DB schema borrows

`FriendStatus` (`dto.ts:12`), `ConversationKind` (`dto.ts:28`), `MemberRole` (`dto.ts:30`), `MessageKind`, `NotificationType`, and the `NotificationPayload`/`MessageMetadata` shapes are all imported by `packages/database/src/schema.ts:9` and used to `$type<...>()` Drizzle columns — e.g. `status: text("status").$type<FriendStatus>()` on the `friendship` table (`schema.ts:190`) and `role: text("role").$type<MemberRole>()` on `conversation_member` (`schema.ts:231`). So the shared chat types are not just the *wire* contract; they are also the **shape contract for the database's text/JSONB columns**, keeping the persisted form and the transmitted form aligned by construction.

## The Zod schemas (`types/chat/schemas.ts`)

This file is small but load-bearing. There are four exported schemas, and the distinction between them is *who produces the data*. It opens by importing `gameTypeSchema` from shared's game types (`schemas.ts:2`) and `seriesScoreSchema` from the series types (`schemas.ts:3`) — `gameTypeSchema` is a `z.enum` over the registered game types (`packages/shared/src/types/games/core.ts:4`) — and defines one private helper, `gameCardPlayerSchema` (`schemas.ts:5`), a `.strict()` `{ userId, username, role }` shape used for the card's `players` array:

```ts
export const gameCardMetaSchema = z
  .object({
    gameId: z.string().min(1),
    gameType: gameTypeSchema,
    seatingMode: z.enum(["open", "challenge"]),
    challengedUserId: z.string().nullable().optional(),
    creatorUsername: z.string(),
    status: z.string().optional(),
    winner: z.string().nullable().optional(),
    winnerUsername: z.string().nullable().optional(),
    players: z.array(gameCardPlayerSchema).optional(),
    seriesScore: seriesScoreSchema.optional(),
  })
  .strict();
```

- **`gameCardMetaSchema`** — the metadata embedded in a `"game_card"` message. It is split into *durable* fields written once at creation (`gameId`, `gameType`, `seatingMode`, `challengedUserId`, `creatorUsername`) and *live* fields that are recomputed from the real game on every read (`status`, `winner`, `winnerUsername`, `players`, and `seriesScore` — the rematch-series standing, `seriesScoreSchema` from `@gamelobby/shared/types`, `schemas.ts:24`) — all `.optional()` because they don't exist until the game has progressed. `gameType` is `gameTypeSchema`, so an unregistered type can't be persisted into a card. `.strict()` rejects unknown keys, so a malformed card can't slip extra fields into JSONB.
- **`notificationPayloadSchema`** — the JSONB payload of a notification; every field optional (`schemas.ts:28`), with `conversationId`, `gameId`, `gameType` (also `gameTypeSchema.optional()`), and `requestId`. It is intentionally loose because different `NotificationType`s carry different subsets (`gameId` + `gameType` for a game start, `requestId` for a friend request).
- **`clientCreateGameInConversationSchema`** and **`clientRematchSchema`** — the two schemas that validate **untrusted client input** on the game side of the chat lane. `clientRematchSchema` (`schemas.ts:45`) is a `.strict()` `{ gameId }` (the finished game's code) — the rematch counterpart to creation:

```ts
export const clientCreateGameInConversationSchema = z
  .object({
    conversationId: z.string().min(1),
    gameType: gameTypeSchema,
    seatingMode: z.enum(["open", "challenge"]).optional(),
    challengedUserId: z.string().nullable().optional(),
    config: z.unknown().optional(),
  })
  .strict();
```

This is the chat-lane equivalent of the wire `clientMakeMoveSchema` (also in shared). The handler `safeParse`s the raw socket payload against it before doing anything (`apps/server/src/realtime/games-in-chat.ts:18`, and `clientRematchSchema` at `:45`); a parse failure is answered with `{ ok: false, error: "Invalid payload" }`. Because `gameType` is `gameTypeSchema`, an unknown game type is rejected at the parse boundary itself (the registry-typed `gameTypeSchema` is covered by `packages/shared/tests/game-types.test.ts` — "chess" fails, "tic-tac-toe" passes), so the service can take a typed `GameType`. Note `config` is `z.unknown()` here — the chat schema deliberately doesn't know the per-game config shape. The *game's own* `configSchema` (from games-core's registry) validates `config` later, inside the service (`apps/server/src/chat/games-in-chat-service.ts:90`). Each schema owns only what it legitimately knows.

## The socket contract (`constants/chat.ts` + `types/chat/socket-events.ts`)

### `CHAT_EVENTS`: one registry of names, `as const`

```ts
export const CHAT_EVENTS = {
  conversationJoin: "conversation:join",
  conversationLeave: "conversation:leave",
  sendMessage: "send_message",
  ...
  createGameInConversation: "game:create_in_conversation",
  rematch: "game:rematch",

  messageNew: "message_new",
  messageUpdated: "message_updated",
  rematchCreated: "game:rematch_created",
  messageDeleted: "message_deleted",
  ...
  presenceSnapshot: "presence_snapshot",
} as const;
```

The object is split (by blank line, `constants/chat.ts:19`) into **client→server** event keys (top group: `conversationJoin` … `rematch`) and **server→client** keys (bottom group: `messageNew` … `presenceSnapshot`). The game side adds `rematch` (client → server, payload `{ gameId }`, acks the new game's code) and `rematchCreated` (server → the *old* game's room, payload `{ newGameId }`). Because it's `as const`, every value is a string literal type, so referencing `CHAT_EVENTS.messageNew` gives you the exact string `"message_new"` — and a typo like `CHAT_EVENTS.mesageNew` fails to compile. **Neither side ever hardcodes a raw event string**; the server emits with `CHAT_EVENTS.messageNew` (`apps/server/src/chat/messages-service.ts:49`) and the client subscribes with the same constant (`apps/web/app/chat-socket-bridge.tsx:81`). This is exactly why the contract can't drift: the name lives in one place that both ends import.

### `Client*` and `Server*` payload types

For each event there is a payload type. Client-emitted payloads are `Client*` (`ClientSendMessage`, `ClientCreateDm`, `ClientFriendRespond`, `ClientRematch` (`socket-events.ts:60`), …) and server-pushed payloads are `Server*` (`ServerMessageNew`, `ServerConversationUpdated`, `ServerNotificationNew`, `ServerRematchCreated = { newGameId: string }` (`socket-events.ts:62`), …). The server payload types are thin wrappers around the DTOs — e.g. `ServerMessageNew = { message: MessageJson; clientId?: string }` (`socket-events.ts:64`) — which is what gives the realtime layer end-to-end typing: the server emits a `MessageJson` and the client's handler receives a `MessageJson`.

Two payload types are **derived from the Zod schemas** rather than written by hand, again so the runtime validator and the static type stay in lockstep:

```ts
export type ClientCreateGameInConversation = z.infer<
  typeof clientCreateGameInConversationSchema
>;
```

### `Ack` / `AckResult`: the request/response convention

Socket.IO supports acknowledgement callbacks, and the shared chat contracts standardize their shape:

```ts
export type AckResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type Ack<T = Record<string, never>> = (res: AckResult<T>) => void;
```

This is a discriminated union on `ok`: success carries the extra payload `T`; failure carries an `error` string. The server's handlers return this shape (`ack?.({ ok: false, error: "Invalid payload" })` in `apps/server/src/realtime/games-in-chat.ts:20`), and the web client narrows on `res.ok` to either use the data or surface the error. It turns "fire an event and hope" into a typed request/response over the socket.

## Game cards: how a game gets embedded in a conversation

This is the most interesting flow these chat contracts enable, and it's where the chat lane and the game lane meet. A game card is a regular `"game_card"` message whose `metadata` is a `GameCardMeta` and whose `gameId` points at a real row in the `game` table. Because the card carries a `gameId`, its *live* fields (status, winner, players, and the rematch-series `seriesScore`) can always be refreshed from the authoritative game. Each game in a rematch series — the original and every rematch — posts its own card, and once the series has two games (`seriesScore.totalGames >= 2`) the web card (`game-card-message.tsx`) upgrades from a plain result to the **scoreboard + "View series" + "Rematch"** presentation.

### Creation walkthrough (client → server)

1. **User taps the gamepad** in a conversation. The web `GameLauncher` emits the event with an ack, using the shared constant: `emitAck(socket, CHAT_EVENTS.createGameInConversation, { conversationId, gameType, seatingMode, challengedUserId })` → `apps/web/app/chat/[handle]/game-launcher.tsx:37`.
2. **Server socket handler** receives the raw payload and validates it against the untrusted-input schema: `clientCreateGameInConversationSchema.safeParse(payload)` → `apps/server/src/realtime/games-in-chat.ts:18`. On failure it acks an error; on success it calls the service with `socket.data.userId` (the *authenticated* user, never a user id from the payload).
3. **Service** `createGameInConversation` (`apps/server/src/chat/games-in-chat-service.ts:66`) takes a typed `GameType` and does the authority checks the wire schema can't: caller is a member (`games-in-chat-service.ts:76`), the game type has an engine (`hasEngine`, `games-in-chat-service.ts:79`), the **one-live guard** (`findLiveGameInConversation`, `games-in-chat-service.ts:81`) short-circuits to an existing live game of that type, and crucially **the `config` is validated by the game's own schema** — `definition.configSchema.safeParse(input.config ?? {})` (`games-in-chat-service.ts:90`). It then creates the real game row via the games-core engine (`engine.createInitialState`, `games-in-chat-service.ts:130`).
4. **The card metadata is built** (in the shared `announceGame` helper) as a `GameCardMeta` with only the durable fields, then persisted as a `"game_card"` message:

```ts
const metadata: GameCardMeta = {
  gameId: opts.game.code,
  gameType: opts.game.gameType,
  seatingMode: opts.seatingMode,
  challengedUserId: opts.challengedUserId,
  creatorUsername: opts.creatorUsername,
};
const sent = await sendMessage({
  conversationId,
  senderId: opts.actorUserId,
  kind: "game_card",
  metadata,
  gameId: opts.game.id,
});
```

(`apps/server/src/chat/games-in-chat-service.ts:31`). Note the **two** ids here, the same split that runs through the whole platform: `metadata.gameId` is the game's shareable **room code** (`opts.game.code` — what `/play/<code>` and the notification payload carry, `games-in-chat-service.ts:32`/`:57`), while the message row's own `gameId` is the internal **UUID** foreign key to the `game` table (`opts.game.id`, `games-in-chat-service.ts:43`). `sendMessage` broadcasts a `ServerMessageNew` (`CHAT_EVENTS.messageNew`) to the conversation room (`messages-service.ts:49`), and `announceGame` also fans out `game_challenge` / `game_started` notifications to the *other* members via `notify` (`games-in-chat-service.ts:50`). The same helper is reused by `rematchGame`, so each rematch posts its own card.

So the durable creation path is: **`game-launcher.tsx:37` (emit) → `games-in-chat.ts:18` (validate w/ the shared chat schema) → `games-in-chat-service.ts:66` (authz + one-live guard + games-core config validate + create game) → `messages-service.ts:32` (persist message) → `CHAT_EVENTS.messageNew` broadcast → `chat-socket-bridge.tsx:81` (client writes into the messages atom) → `game-card-message.tsx` renders the card.**

### Enrichment: live status on every read

The durable card stores no status. Whenever a card is serialized, the server *re-derives* the live fields from the current game row. `assembleMessage` calls `withGameCardStatus`, which looks up the game and merges:

```ts
async function withGameCardStatus(
  msg: MessageJson,
  row: MessageRow,
): Promise<MessageJson> {
  if (msg.kind !== "game_card" || !row.gameId || !msg.metadata) return msg;
  const game = await games.getGameById(row.gameId);
  if (!game) return msg;
  const seriesGames = game.seriesId
    ? await games.getSeriesGames(game.seriesId)
    : [game];
  return {
    ...msg,
    gameId: game.code,
    metadata: enrichGameCardMeta(msg.metadata as GameCardMeta, {
      status: game.status,
      winner: game.winner,
      players: (game.players ?? []) as GamePlayer[],
      seriesScore: computeSeriesScore(seriesGames),
    }),
  };
}
```

(`apps/server/src/chat/assemble.ts:29`). Three things happen on read. First, the function looks up the game by the message's FK `row.gameId` — the internal **UUID** — but **rewrites the serialized `gameId` to `game.code`** (`assemble.ts:41`), so the wire DTO carries the public **room code** the client opens at `/play/<code>` while the `message.game_id` column itself stays the UUID. `apps/server/tests/assemble.test.ts` pins exactly this split: the wire `gameId` becomes the code when the game is found, and stays the UUID when the game is missing or the card has no metadata. Second, it loads the whole **series** (`getSeriesGames(game.seriesId)`, `assemble.ts:36`) and folds its `computeSeriesScore` tally into the metadata as `seriesScore` — so the card and the "View series" modal show the same standing (the card only renders the scoreboard once `totalGames >= 2`, i.e. a rematch exists). Third, `enrichGameCardMeta` (`apps/server/src/chat/game-card.ts:10`) spreads the live `status` / `winner` / `players` / `seriesScore` onto the base metadata and resolves the winner's user id to a `winnerUsername` (returning `null` for a draw or an unknown winner — exercised in `apps/server/tests/game-card.test.ts:35` and `:75`). The key insight: **the card never goes stale because its status fields aren't authoritative — the `game` row is.** The card is just a denormalized view, recomputed on read.

### Cross-lane re-broadcast: the game lane updates the chat card

The other half is the *game* lane pushing updates back into the *chat* lane. When a player joins or makes a move, the turn-based driver calls `broadcastGameCard(io, gameId)` (`apps/server/src/realtime/turn-based.ts:122` after a seat change, `turn-based.ts:174` after a move). That helper finds the card message for the game, re-assembles it (re-running enrichment), and emits a `CHAT_EVENTS.messageUpdated` to the originating conversation:

```ts
export async function broadcastGameCard(
  io: IOServer,
  gameId: string,
): Promise<void> {
  const row = await messagesRepo.getGameCardByGameId(gameId);
  if (!row) return;
  const message = await assembleMessage(row);
  emitToConv(io, row.conversationId, CHAT_EVENTS.messageUpdated, { message });
}
```

(`apps/server/src/chat/game-card-broadcast.ts:7`). It no-ops when the game wasn't started from a conversation (`getGameCardByGameId` returns nothing — see `apps/server/tests/game-card.test.ts:130`). On the client, `CHAT_EVENTS.messageUpdated` is handled in `apps/web/app/chat-socket-bridge.tsx:106`, which upserts the refreshed message into the atom and re-renders the card with its new status badge. So a move made on the game board live-updates the "In progress" / "Bob won" pill on the card sitting in the chat — without the card and the board sharing any state beyond the `gameId`.

## A typical inbound message, end to end

Putting the DTO + socket pieces together for an ordinary text message:

1. Client emits `CHAT_EVENTS.sendMessage` with a `ClientSendMessage` payload (`{ conversationId, clientId, body, ... }`, `socket-events.ts:20`).
2. Server handler `apps/server/src/realtime/chat.ts:35` reads `socket.data.userId`, normalizes the payload, and calls `messagesService.sendMessage`.
3. `sendMessage` inserts a `message` row (typed by `MessageKind` / `MessageMetadata` via `packages/database/src/schema.ts:244`), then `assembleMessage` (`apps/server/src/chat/assemble.ts:46`) turns the Drizzle `MessageRow` + sender into a `MessageJson` using `serializeMessage` (`apps/server/src/api/serialize.ts:86`).
4. It emits `CHAT_EVENTS.messageNew` with a `ServerMessageNew` (`{ message, clientId }`) to the conversation room (`messages-service.ts:49`).
5. The web `ChatSocketBridge` is subscribed via `useSocketEvent<ServerMessageNew>(CHAT_EVENTS.messageNew, ...)` (`apps/web/app/chat-socket-bridge.tsx:80`); it `upsertMessage`s into `messagesAtomFamily(conversationId)` (a Jotai atom typed `ChatMessage = MessageJson & { pending?; clientId? }`, `apps/web/lib/chat/atoms.ts:21`) and bumps the conversation's `unreadCount`.

At no point does either side re-declare the message shape — `MessageJson` and `CHAT_EVENTS.messageNew` are the single definitions, imported on both ends. The `clientId` echoed back is how the client reconciles its optimistic "pending" bubble with the server's canonical row (`upsertMessage`, `apps/web/lib/chat/atoms.ts:62`).

## Gotchas, invariants & conventions

- **No React, minimal deps.** `@gamelobby/shared` must remain importable by the server. Its only runtime deps are `zod` and `@gamelobby/avatar` (`packages/shared/package.json:15`). The avatar import is `import type` only. Don't add React, DOM, or `socket.io` runtime imports here.
- **Timestamps are `string | null`, never `Date`.** Every `*At` field in a DTO is an ISO string. The conversion happens once, in `serialize.ts`'s `iso()` (`apps/server/src/api/serialize.ts:22`). Producing a `Date` anywhere in a DTO is a bug.
- **The Zod schema is the source of truth; the TS type is `z.infer`.** `GameCardMeta` and `NotificationPayload` are derived from their schemas (`dto.ts:49`, `dto.ts:98`), and `ClientCreateGameInConversation` from its schema (`socket-events.ts:53`). Edit the schema, not the type.
- **Two client payloads are validated by the chat schemas.** `clientCreateGameInConversationSchema` and `clientRematchSchema` are the untrusted-input validators in the chat area. `ClientSendMessage` and friends are *types only* — the chat handler validates those ad hoc with `isObj`/`str` helpers (`apps/server/src/realtime/chat.ts:35`). The `gameType` field is validated against the registry (`gameTypeSchema`) at the parse boundary; per-game `config` is NOT validated here — the game's own `configSchema` does that in the service (`games-in-chat-service.ts:90`).
- **`gameCardMetaSchema.strict()` matters.** The card metadata lands in a JSONB column. `.strict()` (`schemas.ts:26`) rejects unknown keys so junk can't accumulate in the DB.
- **Game-card status is never trusted from the stored card.** The durable card holds only `gameId` + creation fields; `status`/`winner`/`players` are *always* re-derived from the live game via `enrichGameCardMeta` on read (`apps/server/src/chat/assemble.ts:28`). Don't read status off the raw message metadata — read the assembled one.
- **`sender` (and a message's `body`/`metadata` after deletion) can be `null`.** System messages have no sender; a soft-deleted message has its `body` and `metadata` nulled at serialize time (`serialize.ts:96`). Client renderers must handle the null cases.
- **Event names live only in `CHAT_EVENTS`.** Never type a raw string like `"message_new"` in a handler; always `CHAT_EVENTS.messageNew`. The split into client→server vs. server→client groups (the blank line at `constants/chat.ts:19`) is a convention, not enforced — keep new events in the right group.
- **Acks follow the `AckResult` discriminated union.** Server handlers must return `{ ok: true, ... }` or `{ ok: false, error }`; clients must narrow on `ok` before reading the rest.
- **DB column types are borrowed from the shared chat types.** `packages/database/src/schema.ts:9` imports the unions to `$type<...>()` columns. Changing a union (e.g. adding a `MessageKind`) is a schema-affecting change — coordinate with a migration/`db:push`. The `packages/database/src/drift-guard.ts` compile-time checks assert each Drizzle table's `$inferSelect` equals the hand-written row type in `@gamelobby/shared/types`.
- **The contract is exercised through its consumers.** The registry-typed `gameType` is covered by `packages/shared/tests/game-types.test.ts` (`gameTypeSchema` accepts a registered slug, rejects "chess") and the wire schemas by `packages/shared/tests/schemas.test.ts`. Beyond that, the chat contract is exercised through its consumers — notably the game-card behavior in `apps/server/tests/game-card.test.ts`. Add focused tests near the consumer that owns the logic.

## Where to go next

- **[Architecture overview](./README.md)** — the system shape and the shared-logic insight that this package embodies on the chat side.
- **[Realtime / Socket.IO lanes](./realtime.md)** — how the chat lane and game lane share one connection, how `CHAT_EVENTS` handlers are attached per-connection, and rooms/broadcast helpers.
- **[Server API & services](./server-api.md)** — the `chat/` service layer (`assemble.ts`, `messages-service.ts`, `games-in-chat-service.ts`) and `api/serialize.ts` that turn rows into the DTOs defined here.
- **[Database schema](./database-schema.md)** — the Drizzle `message` / `conversation` / `notification` / `friendship` tables whose columns are typed by the shared chat unions and JSONB shapes.
- **[games-core: schemas](./games-core-schemas.md)** — the game-side mirror of this package: the strict Zod schemas (including `configSchema`) that validate the `config` a game card carries.
- **[games-core: engine](./games-core-engine.md)** — `createInitialState` / `reduce`, called when a game card spawns a real game.
- **[games-client](./games-client.md)** — the React board UIs that a card's "Open"/"Join" link routes to.
- **[Web app](./web.md)** — the Jotai atoms (`lib/chat/atoms.ts`) and `ChatSocketBridge` that consume these DTOs and subscribe to `CHAT_EVENTS`.
- **[Auth](./auth.md)** — how `socket.data.userId` (the authenticated identity used in place of any client-supplied id) is established on the connection.
