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

// ---- chat rooms ----

export function convRoom(conversationId: string): string {
  return `conv:${conversationId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function joinConvRoom(socket: Socket, conversationId: string): void {
  void socket.join(convRoom(conversationId));
}

export function leaveConvRoom(socket: Socket, conversationId: string): void {
  void socket.leave(convRoom(conversationId));
}

export function emitToConv(
  io: IOServer,
  conversationId: string,
  event: string,
  payload: unknown,
): void {
  io.to(convRoom(conversationId)).emit(event, payload);
}

export function emitToUser(
  io: IOServer,
  userId: string,
  event: string,
  payload: unknown,
): void {
  io.to(userRoom(userId)).emit(event, payload);
}
