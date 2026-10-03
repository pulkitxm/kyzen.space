import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: () => {},
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
    expect(html).toContain('aria-label="Difficulty for Bot 1"');
    expect(html).toContain('aria-label="Remove Bot 1"');
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
    expect(html).toContain("Hard");
    expect(html).not.toContain("Start game");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("Add bot");
    expect(html).not.toContain("Remove Bot 1");
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
