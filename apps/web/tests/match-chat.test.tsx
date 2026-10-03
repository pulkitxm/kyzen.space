import { describe, expect, it, mock } from "bun:test";
import type { GameJson, MatchMessage } from "@kyzen/shared/types";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: () => {},
  emitAck: async () => ({ ok: true, code: "A2K9P7" }),
}));

const {
  chatPanelMode,
  chatPeers,
  friendStates,
  isIncomingMatchMessage,
  mergeMatchMessages,
} = await import("@/lib/games/match-chat");
const { MatchChatPanel } = await import("@/app/play/[gameId]/match-chat-panel");

function game(over: Partial<GameJson>): GameJson {
  return {
    id: "A2K9P7",
    gameType: "tic-tac-toe",
    status: "active",
    winner: null,
    players: [
      { userId: "u1", username: "alice", role: "X" },
      { userId: "u2", username: "bob", role: "O" },
    ],
    gameState: {},
    conversationId: null,
    ...over,
  };
}

function message(id: string, createdAt: string): MatchMessage {
  return { id, gameId: "A2K9P7", authorId: "u1", body: id, createdAt };
}

const publicPlayers = [
  { userId: "A2K9P7:red", username: "Player 1", role: "red" },
  { userId: "A2K9P7:blue", username: "Player 2", role: "blue" },
  { userId: "A2K9P7:green", username: "Player 3", role: "green" },
];

describe("chat panel mode", () => {
  it("uses the conversation when one was loaded", () => {
    expect(chatPanelMode(game({ conversationId: "c1" }), true, "u1")).toBe(
      "conversation",
    );
  });

  it("uses match chat for players of rooms without a conversation", () => {
    expect(chatPanelMode(game({}), false, "u1")).toBe("match");
    expect(
      chatPanelMode(
        game({ publicMatch: true, players: publicPlayers }),
        false,
        "A2K9P7:red",
      ),
    ).toBe("match");
  });

  it("shows no chat for spectators or missing conversations", () => {
    expect(chatPanelMode(game({}), false, "someone-else")).toBe("none");
    expect(chatPanelMode(game({ conversationId: "c1" }), false, "u1")).toBe(
      "none",
    );
  });

  it("lists human peers without the viewer or bots", () => {
    const withBot = game({
      players: [
        ...game({}).players,
        { userId: "bot:1", username: "Easy Bot", role: "C" },
      ],
    });
    expect(chatPeers(withBot, "u1").map((player) => player.userId)).toEqual([
      "u2",
    ]);
  });

  it("merges messages by id in time order", () => {
    const merged = mergeMatchMessages(
      [
        message("b", "2026-01-01T00:00:02Z"),
        message("a", "2026-01-01T00:00:01Z"),
      ],
      [
        message("b", "2026-01-01T00:00:02Z"),
        message("c", "2026-01-01T00:00:03Z"),
      ],
    );
    expect(merged.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("incoming match messages", () => {
  const known = [message("a", "2026-01-01T00:00:01Z")];

  it("counts new messages from other players", () => {
    expect(
      isIncomingMatchMessage(
        known,
        { ...message("b", "2026-01-01T00:00:02Z"), authorId: "u2" },
        "u1",
      ),
    ).toBe(true);
  });

  it("skips the viewer's own messages and repeated deliveries", () => {
    expect(
      isIncomingMatchMessage(known, message("b", "2026-01-01T00:00:02Z"), "u1"),
    ).toBe(false);
    expect(
      isIncomingMatchMessage(
        known,
        { ...message("a", "2026-01-01T00:00:01Z"), authorId: "u2" },
        "u1",
      ),
    ).toBe(false);
  });
});

describe("friend states", () => {
  it("marks chosen players and mutual friends per player", () => {
    expect(
      friendStates({
        choices: ["A2K9P7:blue", "A2K9P7:green"],
        friends: [{ playerId: "A2K9P7:green", username: "greta" }],
      }),
    ).toEqual({
      "A2K9P7:blue": { chosen: true, mutual: false, peerUsername: null },
      "A2K9P7:green": { chosen: true, mutual: true, peerUsername: "greta" },
    });
    expect(friendStates({ choices: [], friends: [] })).toEqual({});
  });
});

describe("MatchChatPanel", () => {
  it("keeps aliases and a direct add friend action in two player public matches", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel
        game={game({
          publicMatch: true,
          players: publicPlayers.slice(0, 2),
        })}
        userId="A2K9P7:red"
      />,
    );
    expect(html).toContain("Player 2");
    expect(html).toContain('aria-label="Add Player 2 as a friend"');
    expect(html).toContain("Profiles are shared only when both players");
  });

  it("targets a specific player when more than two players share a match", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel
        game={game({ publicMatch: true, players: publicPlayers })}
        userId="A2K9P7:red"
      />,
    );
    expect(html).toContain("Player 2, Player 3");
    expect(html).toContain('aria-label="Add friends"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Message the players in this match.");
  });

  it("uses real names without friend actions in private rooms", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel game={game({})} userId="u1" onViewProfile={() => {}} />,
    );
    expect(html).toContain("bob");
    expect(html).not.toContain("as a friend");
    expect(html).not.toContain("Profiles are shared");
    expect(html).toContain('aria-label="Match message"');
  });

  it("opens chat for seated players while a private lobby waits", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel game={game({ status: "waiting" })} userId="u1" />,
    );
    expect(html).toContain('aria-label="Match message"');
    expect(html).toContain("Message the players in this match.");
  });

  it("explains an empty private lobby without promising players", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel
        game={game({
          status: "waiting",
          players: [{ userId: "u1", username: "alice", role: "X" }],
        })}
        userId="u1"
      />,
    );
    expect(html).toContain("Chat opens when another player joins this room.");
    expect(html).not.toContain('aria-label="Match message"');
    expect(html).not.toContain("Waiting for players");
  });

  it("hides the input when only bots share the match", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel
        game={game({
          players: [
            { userId: "u1", username: "alice", role: "X" },
            { userId: "bot:1", username: "Bot 1 (Hard)", role: "O" },
          ],
        })}
        userId="u1"
      />,
    );
    expect(html).toContain("Only bots are in this match");
    expect(html).toContain("No other players");
    expect(html).not.toContain('aria-label="Match message"');
    expect(html).not.toContain("Waiting for players");
    expect(html).not.toContain("opponent");
  });

  it("waits for public matches to start before opening chat", () => {
    const html = renderToStaticMarkup(
      <MatchChatPanel
        game={game({
          status: "waiting",
          publicMatch: true,
          players: publicPlayers.slice(0, 2),
        })}
        userId="A2K9P7:red"
      />,
    );
    expect(html).toContain("Match chat opens when the game starts.");
    expect(html).not.toContain('aria-label="Match message"');
  });
});
