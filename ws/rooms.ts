import type { Server, Socket } from "socket.io";

export function joinGameRoom(socket: Socket, gameId: string): void {
  socket.join(gameRoomName(gameId));
}

export function leaveGameRoom(socket: Socket, gameId: string): void {
  socket.leave(gameRoomName(gameId));
}

export function gameRoomName(gameId: string): string {
  return `game:${gameId}`;
}

export function emitToGame(
  io: Server,
  gameId: string,
  event: string,
  payload: unknown,
): void {
  io.to(gameRoomName(gameId)).emit(event, payload);
}
