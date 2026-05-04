import Link from "next/link";
import { notFound } from "next/navigation";
import mongoose from "mongoose";

import { connectMongoose } from "@/database/mongoose";
import { Game, Move } from "@/database/models";
import { getServerSession } from "@/lib/get-server-session";

import { TicTacToeGameClient } from "./game-client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ gameId: string }> };

export default async function TicTacToeGamePage({ params }: Props) {
  const { gameId } = await params;
  if (!mongoose.isValidObjectId(gameId)) notFound();

  await connectMongoose();
  const game = await Game.findById(gameId).lean();
  if (!game) notFound();

  const moves = await Move.find({ gameId: game._id })
    .sort({ moveNumber: 1 })
    .lean();

  const session = await getServerSession();

  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link
          href="/games/tic-tac-toe"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
        >
          ← Lobby
        </Link>
        <h1 className="mt-6 text-xl font-semibold">Tic-tac-toe</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Status:{" "}
          <span className="font-medium text-neutral-800 dark:text-neutral-200">
            {game.status}
          </span>
        </p>

        <TicTacToeGameClient
          gameId={gameId}
          userId={session?.user?.id ?? null}
          initialGame={JSON.parse(JSON.stringify(game))}
          initialMoves={JSON.parse(JSON.stringify(moves))}
        />
      </div>
    </div>
  );
}
