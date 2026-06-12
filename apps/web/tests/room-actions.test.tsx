import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}));

mock.module("@/lib/auth/ensure-identity", () => ({
  ensureIdentity: async () => {},
}));

mock.module("@/lib/socket/socket-context", () => ({
  socketStatusAtom: { debugLabel: "socketStatus" },
  SocketProvider: ({ children }: { children: unknown }) => children,
  useSocket: () => ({ socket: null }),
  useSocketEvent: () => {},
  emitAck: async () => ({ ok: true, code: "A2K9P7" }),
}));

const { RoomActions } = await import("@/app/games/_shared/room-actions");

const meta = {
  type: "tic-tac-toe" as const,
  name: "Tic-tac-toe",
  description: "Classic 3x3.",
  categoryId: "board-classics",
};

describe("RoomActions", () => {
  it("renders the primary Play button and 50/50 Create + Join", () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal meta for render
    const html = renderToStaticMarkup(<RoomActions meta={meta as any} />);
    expect(html).toContain("Play");
    expect(html).toContain("Create");
    expect(html).toContain("Join");
    expect(html).toContain("grid-cols-2");
  });

  it("does not show the join code panel before Join is opened", () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal meta for render
    const html = renderToStaticMarkup(<RoomActions meta={meta as any} />);
    expect(html).not.toContain("Enter a room code");
  });
});
