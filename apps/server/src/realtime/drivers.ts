import type { Server as IOServer, Socket } from "socket.io";
import { handleJoinRoom, handleMakeMove } from "./turn-based";

export interface RealtimeDriver {
  readonly kind: string;
  joinRoom(
    io: IOServer,
    socket: Socket,
    payload: { gameId: string },
  ): Promise<void>;
  makeMove(
    io: IOServer,
    socket: Socket,
    payload: { gameId: string; moveData: unknown },
  ): Promise<void>;
}

const socketIoTurnBasedDriver: RealtimeDriver = {
  kind: "socketio-turn-based",
  joinRoom: handleJoinRoom,
  makeMove: handleMakeMove,
};

export function getDriver(_gameType: string): RealtimeDriver {
  return socketIoTurnBasedDriver;
}
