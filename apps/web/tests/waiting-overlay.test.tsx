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

describe("WaitingForOpponentOverlay", () => {
  it("shows the room code and share buttons while waiting for an opponent", () => {
    const html = renderToStaticMarkup(
      <WaitingForOpponentOverlay gameId="A2K9P7" initialGame={game({})} />,
    );
    expect(html).toContain("A2K9P7");
    expect(html).toContain("Waiting for your opponent");
    expect(html).toContain("Copy code");
    expect(html).toContain("Copy link");
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
      <WaitingForOpponentOverlay gameId="A2K9P7" initialGame={active} />,
    );
    expect(html).not.toContain("Waiting for your opponent");
  });
});
