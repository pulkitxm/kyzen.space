import { describe, expect, it, mock } from "bun:test";
import { LOBBY_MAX_BOTS } from "@kyzen/shared/types";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

const pendingEvents = new Map<string, unknown>();

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    if (!pendingEvents.has(event)) return;
    const payload = pendingEvents.get(event);
    pendingEvents.delete(event);
    handler(payload);
  },
  emitAck: async () => ({ ok: true, code: "A2K9P7" }),
}));

const { WaitingForOpponentOverlay } = await import(
  "@/app/play/[gameId]/waiting-overlay"
);

// biome-ignore lint/suspicious/noExplicitAny: minimal game json for render
function game(over: any) {
  return {
    id: "A2K9P7",
    gameType: "tic-tac-toe",
    status: "waiting",
    winner: null,
    players: [{ userId: "u1", username: "alice", role: "X" }],
    gameState: {},
    ...over,
  };
}

const lobby = { teams: true, bots: true, minPlayers: 2, maxPlayers: 6 };

const lobbyGame = game({
  creatorUserId: "u1",
  gameState: null,
  players: [
    { userId: "u1", username: "alice", role: "one" },
    { userId: "u2", username: "bob", role: "two" },
  ],
  config: {
    mode: "teams",
    teams: { u1: "A", u2: "B" },
    bots: [{ id: "bot:1", difficulty: "hard", team: "A" }],
  },
});

function render(viewer: string, value = lobbyGame, settings = lobby) {
  return renderToStaticMarkup(
    <WaitingForOpponentOverlay
      gameId="A2K9P7"
      game={value}
      userId={viewer}
      lobby={settings}
    />,
  );
}

describe("WaitingForOpponentOverlay", () => {
  it("shows the room code and share buttons while waiting for an opponent", () => {
    const html = renderToStaticMarkup(
      <WaitingForOpponentOverlay
        gameId="A2K9P7"
        game={game({})}
        userId="u1"
        lobby={null}
      />,
    );
    expect(html).toContain("A2K9P7");
    expect(html).toContain("Waiting for players");
    expect(html).toContain("Copy code");
    expect(html).toContain("Copy link");
    expect(html).not.toContain("Game lobby");
  });

  it("keeps waiting visible when a game needs more seats", () => {
    const waiting = game({
      status: "waiting",
      players: [
        { userId: "u1", username: "alice", role: "one" },
        { userId: "u2", username: "bob", role: "two" },
      ],
    });
    const html = renderToStaticMarkup(
      <WaitingForOpponentOverlay
        gameId="A2K9P7"
        game={waiting}
        userId="u1"
        lobby={null}
      />,
    );
    expect(html).toContain("Waiting for players");
  });

  it("renders no overlay once the game is active with two players", () => {
    const active = game({
      status: "active",
      players: [
        { userId: "u1", username: "alice", role: "X" },
        { userId: "u2", username: "bob", role: "O" },
      ],
    });
    const html = renderToStaticMarkup(
      <WaitingForOpponentOverlay
        gameId="A2K9P7"
        game={active}
        userId="u1"
        lobby={null}
      />,
    );
    expect(html).not.toContain("Waiting for players");
  });
});

describe("Lobby panel", () => {
  it("lets the host edit teams, bots, and start the game", () => {
    const html = render("u1");
    expect(html).toContain("Game lobby");
    expect(html).toContain("A2K9P7");
    expect(html).toContain("Copy code");
    expect(html).toContain("Start game");
    expect(html).toContain('aria-label="Team for bob"');
    expect(html).toContain("Bot 1 (Hard)");
    expect(html).toContain('aria-label="Difficulty for Bot 1 (Hard)"');
    expect(html).toContain('aria-label="Remove Bot 1 (Hard)"');
    expect(html).toContain("Add bot");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("3/6");
    expect(html).not.toContain("Waiting for the host to start");
  });

  it("shows a read-only lobby to other players", () => {
    const html = render("u2");
    expect(html).toContain("Game lobby");
    expect(html).toContain("Waiting for the host to start");
    expect(html).toContain("Team B");
    expect(html).toContain("Bot 1 (Hard)");
    expect(html).not.toContain("Start game");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Add bot");
    expect(html).not.toContain("Remove Bot 1");
    expect(html).not.toContain("from the room");
  });

  it("lets seated players leave but not the host or spectators", () => {
    expect(render("u2")).toContain("Leave lobby");
    expect(render("u1")).not.toContain("Leave lobby");
    expect(render("someone-else")).not.toContain("Leave lobby");
  });

  it("lets the host remove other seated players", () => {
    const html = render("u1");
    expect(html).toContain('aria-label="Remove bob from the room"');
    expect(html).not.toContain('aria-label="Remove alice from the room"');
  });

  it("explains removal and offers a way back after being kicked", () => {
    pendingEvents.set("game_error", { message: "Removed from the room" });
    const html = render("u2");
    expect(html).toContain("You were removed from the room");
    expect(html).toContain("Back to games");
    expect(html).not.toContain("Leave lobby");
  });

  it("ignores unrelated game errors", () => {
    pendingEvents.set("game_error", { message: "Not your turn" });
    expect(render("u2")).not.toContain("You were removed");
  });

  it("states the two team requirement in teams mode", () => {
    expect(render("u2")).toContain("at least two different teams");
    expect(
      render("u1", {
        ...lobbyGame,
        config: { ...lobbyGame.config, mode: "ffa" },
      }),
    ).not.toContain("at least two different teams");
  });

  it("caps bots at the lobby limit with a hint", () => {
    const bots = Array.from({ length: LOBBY_MAX_BOTS }, (_, index) => ({
      id: `bot:${index + 1}`,
      difficulty: "easy",
      team: "A",
    }));
    const html = render(
      "u1",
      { ...lobbyGame, config: { mode: "ffa", teams: {}, bots } },
      { ...lobby, maxPlayers: Number.POSITIVE_INFINITY },
    );
    expect(html).toContain(`Bot ${LOBBY_MAX_BOTS} (Easy)`);
    expect(html).toContain("Bot limit reached");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("explains a full room instead of adding bots", () => {
    const html = render("u1", lobbyGame, { ...lobby, maxPlayers: 3 });
    expect(html).toContain("The room is full.");
    expect(html).not.toContain("Bot limit reached");
  });

  it("explains why the host cannot start yet", () => {
    const html = render(
      "u1",
      { ...lobbyGame, players: [lobbyGame.players[0]], config: {} },
      { ...lobby, minPlayers: 3 },
    );
    expect(html).toContain("Needs at least 3 players");
    expect(html).not.toContain("Team for");
  });

  it("hides team and bot controls the engine does not support", () => {
    const html = render("u1", lobbyGame, {
      ...lobby,
      teams: false,
      bots: false,
    });
    expect(html).not.toContain("Free for all");
    expect(html).not.toContain("Team for");
    expect(html).not.toContain("Add bot");
  });
});
