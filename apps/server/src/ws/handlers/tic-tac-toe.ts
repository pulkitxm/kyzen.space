import type { Server as IOServer, Socket } from "socket.io";
import mongoose from "mongoose";
import { connectMongoose } from "@/database/mongoose";
import { Game, Move, UserProfile } from "@/database/models";
import type {
  ClientJoinRoom,
  ClientMakeMove,
  ServerGameStatePayload,
} from "@/ws/messages";
import { emitToGame, joinGameRoom } from "@/ws/rooms";

const TIC_TAC_TOE = "tic-tac-toe";

type Cell = "X" | "O" | null;
type TicState = { board: Cell[]; currentTurn: "X" | "O" };
type GamePlayer = { userId: string; username: string; role: string };

export function initialTicTacToeState(): TicState {
  return {
    board: Array.from({ length: 9 }, () => null) as Cell[],
    currentTurn: "X",
  };
}

const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function lineWinner(board: Cell[]): "X" | "O" | null {
  for (const [a, b, c] of WIN_LINES) {
    const x = board[a];
    if (x && x === board[b] && x === board[c]) return x;
  }
  return null;
}

function isBoardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function serialGame(g: InstanceType<typeof Game>) {
  return g.toJSON() as Record<string, unknown>;
}

function serialMoves(docs: InstanceType<typeof Move>[]) {
  return docs.map((m) => m.toJSON() as Record<string, unknown>);
}

async function bumpStats(
  userId: string,
  gameType: string,
  outcome: "won" | "lost" | "drawn",
) {
  const profile = await UserProfile.findOne({ userId });
  if (!profile) return;
  if (!profile.stats) profile.stats = new Map();

  const key = gameType;
  const raw = profile.stats?.get(key);
  const cur = raw ?? { played: 0, won: 0, lost: 0, drawn: 0 };
  const next = {
    played: cur.played + 1,
    won: cur.won + (outcome === "won" ? 1 : 0),
    lost: cur.lost + (outcome === "lost" ? 1 : 0),
    drawn: cur.drawn + (outcome === "drawn" ? 1 : 0),
  };
  profile.stats.set(key, next);
  await profile.save();
}

async function finalizeGameIfDone(
  game: InstanceType<typeof Game>,
  state: TicState,
): Promise<InstanceType<typeof Game>> {
  if (game.gameType !== TIC_TAC_TOE) return game;

  const w = lineWinner(state.board);
  if (w) {
    const winnerPlayer = (game.players as GamePlayer[]).find(
      (p: GamePlayer) => p.role === w,
    );
    game.winner = winnerPlayer?.userId ?? null;
    game.status = "completed";
    game.completedAt = new Date();
    game.gameState = state;
    await game.save();

    for (const p of game.players as GamePlayer[]) {
      if (p.userId === winnerPlayer?.userId)
        await bumpStats(p.userId, TIC_TAC_TOE, "won");
      else await bumpStats(p.userId, TIC_TAC_TOE, "lost");
    }
    return game;
  }

  if (isBoardFull(state.board)) {
    game.winner = "draw";
    game.status = "completed";
    game.completedAt = new Date();
    game.gameState = state;
    await game.save();
    for (const p of game.players as GamePlayer[]) {
      await bumpStats(p.userId, TIC_TAC_TOE, "drawn");
    }
    return game;
  }

  game.gameState = state;
  await game.save();
  return game;
}

export async function handleJoinRoom(
  io: IOServer,
  socket: Socket,
  payload: ClientJoinRoom,
): Promise<void> {
  await connectMongoose();
  const userId = socket.data.userId;

  let gameId: mongoose.Types.ObjectId;
  try {
    gameId = new mongoose.Types.ObjectId(payload.gameId);
  } catch {
    socket.emit("game_error", { message: "Invalid game id" });
    return;
  }

  const game = await Game.findById(gameId);
  if (!game || game.gameType !== TIC_TAC_TOE) {
    socket.emit("game_error", { message: "Game not found" });
    return;
  }

  const profile = await UserProfile.findOne({ userId });
  const username = profile?.username ?? "player";

  const already = (game.players as GamePlayer[]).some(
    (p: GamePlayer) => p.userId === userId,
  );

  if (!already && game.status === "waiting" && game.players.length === 1) {
    game.players.push({ userId, username, role: "O" });
    game.status = "active";
    game.startedAt = new Date();
    game.gameState = game.gameState ?? initialTicTacToeState();
    await game.save();
  } else if (!already) {
    socket.emit("game_error", { message: "Cannot join this game" });
    return;
  }

  joinGameRoom(socket, payload.gameId);
  const moves = await Move.find({ gameId: game._id }).sort({ moveNumber: 1 });

  const out: ServerGameStatePayload = {
    game: serialGame(game),
    moves: serialMoves(moves),
  };
  emitToGame(io, payload.gameId, "game_state", out);
}

export async function handleMakeMove(
  io: IOServer,
  socket: Socket,
  payload: ClientMakeMove,
): Promise<void> {
  await connectMongoose();
  const userId = socket.data.userId;

  let gameId: mongoose.Types.ObjectId;
  try {
    gameId = new mongoose.Types.ObjectId(payload.gameId);
  } catch {
    socket.emit("game_error", { message: "Invalid game id" });
    return;
  }

  const game = await Game.findById(gameId);
  if (!game || game.gameType !== TIC_TAC_TOE) {
    socket.emit("game_error", { message: "Game not found" });
    return;
  }

  if (game.status !== "active") {
    socket.emit("game_error", { message: "Game is not active" });
    return;
  }

  const player = (game.players as GamePlayer[]).find(
    (p: GamePlayer) => p.userId === userId,
  );
  if (!player) {
    socket.emit("game_error", { message: "Not a player in this game" });
    return;
  }

  const state = (game.gameState as TicState) ?? initialTicTacToeState();
  if (state.currentTurn !== player.role) {
    socket.emit("game_error", { message: "Not your turn" });
    return;
  }

  const { row, col } = payload.moveData;
  if (
    typeof row !== "number" ||
    typeof col !== "number" ||
    row < 0 ||
    row > 2 ||
    col < 0 ||
    col > 2
  ) {
    socket.emit("game_error", { message: "Invalid move" });
    return;
  }

  const idx = row * 3 + col;
  if (state.board[idx] !== null) {
    socket.emit("game_error", { message: "Cell occupied" });
    return;
  }

  const nextBoard = [...state.board] as Cell[];
  nextBoard[idx] = player.role as "X" | "O";
  const nextTurn: "X" | "O" = player.role === "X" ? "O" : "X";
  const nextState: TicState = { board: nextBoard, currentTurn: nextTurn };

  const lastMove = await Move.findOne({ gameId: game._id }).sort({
    moveNumber: -1,
  });
  const moveNumber = (lastMove?.moveNumber ?? 0) + 1;

  await Move.create({
    gameId: game._id,
    moveNumber,
    playerId: userId,
    moveData: payload.moveData,
  });

  const updated = await finalizeGameIfDone(game, nextState);

  const moveDoc = await Move.findOne({
    gameId: game._id,
    moveNumber,
  });

  emitToGame(io, payload.gameId, "move_made", {
    move: moveDoc?.toJSON() ?? {},
    gameState: updated.gameState,
  });

  const moves = await Move.find({ gameId: game._id }).sort({ moveNumber: 1 });
  const full: ServerGameStatePayload = {
    game: serialGame(updated),
    moves: serialMoves(moves),
  };
  emitToGame(io, payload.gameId, "game_state", full);

  if (updated.status === "completed") {
    emitToGame(io, payload.gameId, "game_over", {
      winner: updated.winner,
    });
  }
}
