import type {
  MoveJson,
  ServerErrorPayload,
  ServerGameStatePayload,
} from "@kyzen/shared/types";
import type { Socket } from "socket.io-client";

export function mergeGameMoves(
  moves: MoveJson[],
  payload: ServerGameStatePayload,
): MoveJson[] {
  const incoming =
    payload.moves ?? (payload.move ? [...moves, payload.move] : moves);
  return [...new Map(incoming.map((move) => [move.moveNumber, move])).values()]
    .filter((move) => move.gameId === payload.game.id)
    .sort((a, b) => a.moveNumber - b.moveNumber);
}

export function bindGameSession(
  socket: Socket,
  gameId: string,
  onState: (payload: ServerGameStatePayload) => void,
  onError: (message: string | null) => void,
): () => void {
  const join = () => {
    onError(null);
    socket.emit("join_room", { gameId });
  };
  const receiveState = (payload: ServerGameStatePayload) => {
    if (payload.game.id === gameId) onState(payload);
  };
  const receiveError = (payload: ServerErrorPayload) =>
    onError(payload.message);

  socket.on("connect", join);
  socket.on("game_state", receiveState);
  socket.on("game_error", receiveError);
  if (socket.connected) join();

  return () => {
    socket.off("connect", join);
    socket.off("game_state", receiveState);
    socket.off("game_error", receiveError);
    if (socket.connected) socket.emit("leave_room", { gameId });
  };
}
