import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: () => {},
  emitAck: async () => ({ gameId: "NEWGAME1" }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

mock.module("@/lib/popups/use-layered-popup", () => ({
  useLayeredPopup: () => ({ openLayer: () => {}, layers: [] }),
}));

mock.module("@/lib/api-client", () => ({
  clientFetch: async () => new Response("{}"),
  clientFetchJson: async () => ({
    seriesId: "s1",
    gameType: "tic-tac-toe",
    score: {
      entries: [
        { userId: "u1", username: "alice", wins: 1 },
        { userId: "u2", username: "bob", wins: 0 },
      ],
      draws: 0,
      completedGames: 1,
      totalGames: 1,
    },
    games: [],
  }),
}));

const { GameOverOverlay } = await import(
  "@/app/play/[gameId]/game-over-overlay"
);

function completedGame(overrides: Record<string, unknown> = {}) {
  return {
    id: "K7P2QX",
    gameType: "tic-tac-toe" as const,
    status: "completed" as const,
    winner: "u1",
    config: { bestOf: 3 },
    players: [
      { userId: "u1", username: "alice", role: "X" },
      { userId: "u2", username: "bob", role: "O" },
    ],
    gameState: {},
    conversationId: "conv-1",
    ...overrides,
  };
}

describe("GameOverOverlay", () => {
  it("renders the shared result modal with session record", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="K7P2QX"
        userId="u1"
        initialGame={completedGame()}
        conversation={null}
      />,
    );
    expect(html).toContain("Round won!");
    expect(html).toContain("Session record");
    expect(html).toContain("Next round");
    expect(html).toContain("Best of 3");
  });
});
