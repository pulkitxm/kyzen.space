import type { Server as IOServer, Socket } from "socket.io";

export function gameRoom(gameId: string): string {
  return `game:${gameId}`;
}

export function joinGameRoom(socket: Socket, gameId: string): void {
  void socket.join(gameRoom(gameId));
}

export function emitToGame(
  io: IOServer,
  gameId: string,
  event: string,
  payload: unknown,
): void {
  io.to(gameRoom(gameId)).emit(event, payload);
}
