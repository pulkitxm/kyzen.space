import { describe, expect, it, mock } from "bun:test";
import type { PublicQueue } from "@kyzen/shared/types";
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

const { findMatchHref, initialQueueId, queueJoinPayload } = await import(
  "@/lib/games/queues"
);
const { FindClient } = await import("@/app/play/find/[gameType]/find-client");

const queues: PublicQueue[] = [
  {
    id: "duel",
    label: "1v1",
    description: "Two players",
    config: { mode: "duel" },
  },
  {
    id: "teams",
    label: "2v2",
    description: "Four players",
    config: { mode: "teams" },
  },
];

describe("public queue helpers", () => {
  it("only preselects a known queue, or the only queue", () => {
    expect(initialQueueId(queues, null)).toBe(null);
    expect(initialQueueId(queues, "teams")).toBe("teams");
    expect(initialQueueId(queues, "unknown")).toBe(null);
    expect(initialQueueId(queues.slice(0, 1), null)).toBe("duel");
    expect(initialQueueId([], "teams")).toBe(null);
  });

  it("sends the selected queue config with the join request", () => {
    expect(queueJoinPayload("tic-tac-toe", null)).toEqual({
      gameType: "tic-tac-toe",
    });
    expect(queueJoinPayload("tic-tac-toe", queues[1] ?? null)).toEqual({
      gameType: "tic-tac-toe",
      config: { mode: "teams" },
    });
  });

  it("returns to the find page for games without queues", () => {
    expect(findMatchHref({ gameType: "tic-tac-toe", config: {} })).toBe(
      "/play/find/tic-tac-toe",
    );
  });
});

describe("FindClient", () => {
  it("searches immediately for games without queues", () => {
    const html = renderToStaticMarkup(
      <FindClient
        gameType="tic-tac-toe"
        gameName="Tic-tac-toe"
        queues={[]}
        requestedQueue={null}
      />,
    );
    expect(html).toContain("Finding you an opponent...");
    expect(html).not.toContain("Match type");
  });

  it("asks for a queue before searching", () => {
    const html = renderToStaticMarkup(
      <FindClient
        gameType="tic-tac-toe"
        gameName="Tic-tac-toe"
        queues={queues}
        requestedQueue={null}
      />,
    );
    expect(html).toContain("Choose a match");
    expect(html).toContain("1v1");
    expect(html).toContain("2v2");
    expect(html).toContain("Four players");
    expect(html).not.toContain("Finding");
  });

  it("searches the requested queue and keeps the other one switchable", () => {
    const html = renderToStaticMarkup(
      <FindClient
        gameType="tic-tac-toe"
        gameName="Tic-tac-toe"
        queues={queues}
        requestedQueue="teams"
      />,
    );
    expect(html).toContain("Finding a 2v2 match...");
    expect(html).toContain('<legend class="sr-only">Match type</legend>');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Cancel");
  });
});
