import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const CODE = "K7P2QX";

// biome-ignore lint/suspicious/noExplicitAny: test control
let createImpl: any = async () => ({ ok: true, value: { code: CODE } });
// biome-ignore lint/suspicious/noExplicitAny: test control
let joinImpl: any = async () => ({ ok: true, code: CODE });

mock.module("../src/realtime/rooms-service", () => ({
  createStandaloneGame: (...args: unknown[]) => createImpl(...args),
  validateJoinByCode: (...args: unknown[]) => joinImpl(...args),
}));

const { attachRoomHandlers } = await import("../src/realtime/room-events");

type Handler = (payload: unknown, cb?: (res: unknown) => void) => void;

function fakeSocket(userId: string) {
  const handlers = new Map<string, Handler>();
  const socket = {
    data: { userId },
    on: (event: string, fn: Handler) => handlers.set(event, fn),
  };
  return { socket, handlers };
}

async function invoke(handler: Handler | undefined, payload: unknown) {
  return new Promise<unknown>((resolve) => {
    handler?.(payload, resolve);
    setTimeout(() => resolve(undefined), 50);
  });
}

beforeEach(() => {
  createImpl = async () => ({ ok: true, value: { code: CODE } });
  joinImpl = async () => ({ ok: true, code: CODE });
});

describe("room:create", () => {
  test("acks the new room code on success", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:create"), {
      gameType: TIC_TAC_TOE,
    });
    expect(res).toEqual({ ok: true, code: CODE });
  });

  test("acks an error for an invalid payload without calling the service", async () => {
    let called = false;
    createImpl = async () => {
      called = true;
      return { ok: true, value: { code: CODE } };
    };
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = (await invoke(handlers.get("room:create"), {})) as {
      ok: boolean;
    };
    expect(res.ok).toBe(false);
    expect(called).toBe(false);
  });

  test("propagates a service failure", async () => {
    createImpl = async () => ({ ok: false, error: "Unsupported game type" });
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:create"), {
      gameType: TIC_TAC_TOE,
    });
    expect(res).toEqual({ ok: false, error: "Unsupported game type" });
  });
});

describe("room:join", () => {
  test("acks the validated result", async () => {
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: true, code: CODE });
  });

  test("acks not_found for an unparseable code", async () => {
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: "bad" });
    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  test("passes through a typed join error", async () => {
    joinImpl = async () => ({ ok: false, error: "full" });
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: false, error: "full" });
  });
});
