import { describe, expect, it, mock } from "bun:test";
import type { GameJson } from "@kyzen/shared/types";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: () => {},
  emitAck: async () => ({ ok: true, code: "A2K9P7" }),
}));

const { gameWinners, outcomeLabel } = await import("@/lib/games/outcome");
const { GameOverOverlay } = await import(
  "@/app/play/[gameId]/game-over-overlay"
);

const players = [
  { userId: "u1", username: "alice", role: "red" },
  { userId: "u2", username: "bob", role: "blue" },
  { userId: "bot:1", username: "Hard Bot", role: "green" },
  { userId: "u3", username: "carol", role: "gold" },
];

function game(over: Partial<GameJson>): GameJson {
  return {
    id: "A2K9P7",
    gameType: "tic-tac-toe",
    status: "completed",
    winner: null,
    winners: [],
    players,
    gameState: {},
    ...over,
  };
}

describe("game outcome labels", () => {
  it("falls back to the single winner summary", () => {
    expect(gameWinners({ winner: "u1" })).toEqual(["u1"]);
    expect(gameWinners({ winner: "draw", winners: [] })).toEqual([]);
    expect(gameWinners({ winner: null, winners: ["u1", "u2"] })).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("labels solo wins, team wins, and losses for players", () => {
    const solo = game({ winner: "u1", winners: ["u1"] });
    expect(outcomeLabel(solo, "u1")).toBe("You won! 🎉");
    expect(outcomeLabel(solo, "u2")).toBe("You lost");
    const team = game({ winners: ["u1", "bot:1"] });
    expect(outcomeLabel(team, "u1")).toBe("Your team won! 🎉");
    expect(outcomeLabel(team, "u2")).toBe("You lost");
  });

  it("labels draws, abandoned games, and games without winners", () => {
    expect(outcomeLabel(game({ winner: "draw" }), "u1")).toBe("It's a draw");
    expect(outcomeLabel(game({ status: "abandoned" }), "u1")).toBe(
      "Game abandoned",
    );
    expect(outcomeLabel(game({}), "u1")).toBe("Game over");
  });

  it("names the winners for spectators", () => {
    expect(outcomeLabel(game({ winner: "u2", winners: ["u2"] }), "x")).toBe(
      "bob won",
    );
    expect(outcomeLabel(game({ winners: ["u2", "bot:1"] }), "x")).toBe(
      "bob and Hard Bot won",
    );
    expect(
      outcomeLabel(game({ winners: ["u1", "u2", "bot:1", "u3"] }), "x"),
    ).toBe("4 players won");
  });
});

describe("GameOverOverlay", () => {
  it("highlights every winner and shows bots without an avatar", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u2"
        game={game({ winners: ["u2", "bot:1"] })}
        conversation={null}
      />,
    );
    expect(html).toContain("Your team won!");
    expect(html.match(/aria-label="Winner"/g)).toHaveLength(2);
    expect(html.match(/<img/g)).toHaveLength(3);
    expect(html).toContain("Hard Bot");
    expect(html).toContain("max-w-sm");
    expect(html).toContain("flex-wrap");
  });

  it("offers play again for public matches", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="A2K9P7:X"
        game={game({
          publicMatch: true,
          winner: "draw",
          players: [
            { userId: "A2K9P7:X", username: "Player 1", role: "X" },
            { userId: "A2K9P7:O", username: "Player 2", role: "O" },
          ],
        })}
        conversation={null}
      />,
    );
    expect(html).toContain("It&#x27;s a draw");
    expect(html).toContain("Play again");
  });
});
