import type { Server as IOServer, Socket } from "socket.io";
import { handleJoinRoom, handleMakeMove } from "./turn-based";

/**
 * Realtime driver seam (plan decision #11). A driver hosts a game's live
 * connection. Today there is exactly one — the Socket.IO turn-based dispatcher —
 * and every game type resolves to it. A future real-time game (kart racer /
 * shooter) registers its own driver (tick server / fleet) here WITHOUT touching
 * auth, lobby, REST, or persistence.
 */
export interface RealtimeDriver {
  readonly kind: string;
  joinRoom(io: IOServer, socket: Socket, payload: { gameId: string }): Promise<void>;
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

/** Resolve the driver for a game type. Single driver today. */
export function getDriver(_gameType: string): RealtimeDriver {
  return socketIoTurnBasedDriver;
}
