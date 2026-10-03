import {
  afterEach,
  describe,
  expect,
  it,
  jest,
  mock,
  setSystemTime,
} from "bun:test";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import type { GameJson } from "@kyzen/shared/types";
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

const { gameWinners, outcomeLabel, resultDelayMs, resultRevealDelay } =
  await import("@/lib/games/outcome");
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

describe("partial draws", () => {
  const draw = game({ winner: "draw", winners: ["u1", "bot:1"] });

  it("shows a draw only to the co-drawers", () => {
    expect(outcomeLabel(draw, "u1")).toBe("It's a draw");
    expect(outcomeLabel(draw, "u2")).toBe("You lost");
    expect(outcomeLabel(draw, "u3")).toBe("You lost");
  });

  it("treats a draw without co-drawers as a draw for everyone", () => {
    const everyone = game({ winner: "draw", winners: [] });
    expect(outcomeLabel(everyone, "u1")).toBe("It's a draw");
    expect(outcomeLabel(everyone, "u3")).toBe("It's a draw");
    expect(outcomeLabel(everyone, "x")).toBe("It's a draw");
  });

  it("uses neutral wording for spectators", () => {
    expect(outcomeLabel(draw, "x")).toBe("Draw between alice and Hard Bot");
    expect(
      outcomeLabel(
        game({ winner: "draw", winners: ["u1", "u2", "bot:1", "u3"] }),
        "x",
      ),
    ).toBe("Draw between 4 players");
  });
});

const completedAt = "2026-01-01T00:00:00.000Z";
const completedMs = Date.parse(completedAt);

describe("result reveal delay", () => {
  it("waits only for the presentation time left after the server completion", () => {
    expect(resultRevealDelay(completedAt, 5000, completedMs + 2000)).toBe(3000);
    expect(resultRevealDelay(completedAt, 5000, completedMs + 60_000)).toBe(0);
  });

  it("never waits longer than the presentation time on a skewed clock", () => {
    expect(resultRevealDelay(completedAt, 5000, completedMs - 30_000)).toBe(
      5000,
    );
  });

  it("opens immediately without a delay or a completion time", () => {
    expect(resultRevealDelay(completedAt, 0, completedMs)).toBe(0);
    expect(resultRevealDelay(null, 5000, completedMs)).toBe(0);
  });

  it("only delays completed games of engines that ask for it", () => {
    expect(resultDelayMs(game({}))).toBe(0);
    const arena = {
      gameType: "tank-arena" as const,
      gameState: { resolution: { steps: 120 } },
    };
    expect(resultDelayMs({ ...arena, status: "completed" })).toBeGreaterThan(0);
    expect(resultDelayMs({ ...arena, status: "abandoned" })).toBe(0);
  });
});

describe("GameOverOverlay result timing", () => {
  afterEach(() => {
    jest.useRealTimers();
    setSystemTime();
  });

  function overlayAt(now: number, delayMs: number) {
    jest.useFakeTimers();
    setSystemTime(new Date(now));
    return renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u1"
        game={game({ winner: "u1", winners: ["u1"], completedAt })}
        conversation={null}
        resultDelayMs={delayMs}
      />,
    );
  }

  it("keeps the results closed while the final replay plays", () => {
    const html = overlayAt(completedMs + 1000, 5000);
    expect(html).not.toContain("You won!");
    expect(html).not.toContain("Close");
  });

  it("opens immediately when the presentation time already passed", () => {
    expect(overlayAt(completedMs + 5000, 5000)).toContain("You won!");
    expect(overlayAt(completedMs + 3_600_000, 5000)).toContain("You won!");
  });

  it("opens immediately for engines without a result delay", () => {
    expect(overlayAt(completedMs, 0)).toContain("You won!");
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
        resultDelayMs={0}
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
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("It&#x27;s a draw");
    expect(html).toContain("Play again");
    expect(html).not.toContain("Rematch");
  });

  it("hides the results while the game view is covered", () => {
    const props = {
      gameId: "A2K9P7",
      userId: "u1",
      game: game({ winner: "u1", winners: ["u1"] }),
      conversation: null,
      resultDelayMs: 0,
    };
    expect(
      renderToStaticMarkup(<GameOverOverlay {...props} covered />),
    ).not.toContain("Play again");
    expect(
      renderToStaticMarkup(<GameOverOverlay {...props} covered={false} />),
    ).toContain("Play again");
  });

  it("tells players outside a partial draw that they lost", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u2"
        game={game({ winner: "draw", winners: ["u1", "bot:1"] })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("You lost");
  });

  it("offers play again for completed private rooms", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u1"
        game={game({ winner: "u1", winners: ["u1"], conversationId: null })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("Play again");
    expect(html).not.toContain("Rematch");
  });

  it("sends private room players to a rematch someone else created", () => {
    pendingEvents.set(CHAT_EVENTS.rematchCreated, {
      newGameId: "B3L8Q2",
      previousGameId: "A2K9P7",
    });
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u2"
        game={game({ winner: "u1", winners: ["u1"] })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("Go to rematch");
    expect(html).not.toContain("Play again");
  });

  it("ignores rematches created from another game", () => {
    pendingEvents.set(CHAT_EVENTS.rematchCreated, {
      newGameId: "B3L8Q2",
      previousGameId: "Z9Z9Z9",
    });
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u2"
        game={game({ winner: "u1", winners: ["u1"] })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("Play again");
    expect(html).not.toContain("Go to rematch");
  });

  it("keeps the conversation rematch for chat games", () => {
    const html = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u1"
        game={game({ winner: "u1", winners: ["u1"], conversationId: "c1" })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(html).toContain("Rematch");
    expect(html).not.toContain("Play again");
  });

  it("offers no rematch to spectators or after an abandoned game", () => {
    const spectator = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="x"
        game={game({ winner: "u1", winners: ["u1"] })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(spectator).not.toContain("Play again");
    const abandoned = renderToStaticMarkup(
      <GameOverOverlay
        gameId="A2K9P7"
        userId="u1"
        game={game({ status: "abandoned" })}
        conversation={null}
        resultDelayMs={0}
      />,
    );
    expect(abandoned).not.toContain("Play again");
    expect(abandoned).not.toContain("Rematch");
  });
});
