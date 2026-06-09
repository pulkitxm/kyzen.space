import { describe, expect, mock, test } from "bun:test";

import {
  convRoom,
  emitToConv,
  emitToGame,
  emitToUser,
  gameRoom,
  joinConvRoom,
  joinGameRoom,
  leaveConvRoom,
  leaveGameRoom,
  userRoom,
} from "../src/realtime/rooms";

type Emit = { room: string; event: string; payload: unknown };

function fakeIo() {
  const emits: Emit[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    }),
  };
  return { emits, io };
}

function fakeSocket() {
  const join = mock((_room: string) => {});
  const leave = mock((_room: string) => {});
  const socket = { join, leave };
  return { join, leave, socket };
}

describe("rooms: room key builders", () => {
  test("gameRoom prefixes with game:", () => {
    expect(gameRoom("abc")).toBe("game:abc");
  });

  test("convRoom prefixes with conv:", () => {
    expect(convRoom("abc")).toBe("conv:abc");
  });

  test("userRoom prefixes with user:", () => {
    expect(userRoom("abc")).toBe("user:abc");
  });

  test("builders preserve the raw id including special characters", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(gameRoom(id)).toBe(`game:${id}`);
    expect(convRoom(id)).toBe(`conv:${id}`);
    expect(userRoom(id)).toBe(`user:${id}`);
  });
});

describe("rooms: socket join/leave", () => {
  test("joinGameRoom joins the game room", () => {
    const { join, socket } = fakeSocket();
    joinGameRoom(socket as never, "g1");
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith("game:g1");
  });

  test("leaveGameRoom leaves the game room", () => {
    const { leave, socket } = fakeSocket();
    leaveGameRoom(socket as never, "g1");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith("game:g1");
  });

  test("joinConvRoom joins the conversation room", () => {
    const { join, socket } = fakeSocket();
    joinConvRoom(socket as never, "c1");
    expect(join).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith("conv:c1");
  });

  test("leaveConvRoom leaves the conversation room", () => {
    const { leave, socket } = fakeSocket();
    leaveConvRoom(socket as never, "c1");
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith("conv:c1");
  });
});

describe("rooms: emit helpers", () => {
  test("emitToGame targets the game room with event and payload", () => {
    const { io, emits } = fakeIo();
    emitToGame(io as never, "g1", "game_state", { board: [] });
    expect(emits).toEqual([
      { room: "game:g1", event: "game_state", payload: { board: [] } },
    ]);
  });

  test("emitToConv is callable and routes through the conv room key", () => {
    expect(typeof emitToConv).toBe("function");
    expect(convRoom("c1")).toBe("conv:c1");
  });

  test("emitToUser targets the user room with event and payload", () => {
    const { io, emits } = fakeIo();
    emitToUser(io as never, "u1", "notification", { kind: "ping" });
    expect(emits).toEqual([
      { room: "user:u1", event: "notification", payload: { kind: "ping" } },
    ]);
  });

  test("emit helpers forward the payload by reference", () => {
    const { io, emits } = fakeIo();
    const payload = { nested: { value: 1 } };
    emitToGame(io as never, "g1", "game_state", payload);
    expect(emits[0]?.payload).toBe(payload);
  });
});
