import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { connectMongoose } from "@/database/mongoose";
import { Game, UserProfile } from "@/database/models";
import { getAuth } from "@/lib/auth";
import { initialTicTacToeState } from "@/ws/handlers/tic-tac-toe";

export const dynamic = "force-dynamic";

const TIC_TAC_TOE = "tic-tac-toe";

async function createGame() {
  "use server";
  await connectMongoose();
  const session = await getAuth().api.getSession({
    headers: await headers(),
  });
  if (!session?.user?.id) redirect("/auth");

  const profile = await UserProfile.findOne({ userId: session.user.id });
  if (!profile) redirect("/profile");

  const game = await Game.create({
    gameType: TIC_TAC_TOE,
    status: "waiting",
    players: [
      {
        userId: session.user.id,
        username: profile.username,
        role: "X",
      },
    ],
    winner: null,
    gameState: initialTicTacToeState(),
  });

  redirect(`/games/tic-tac-toe/${game._id.toString()}`);
}

export default async function TicTacToeLobbyPage() {
  await connectMongoose();
  const waiting = await Game.find({
    gameType: TIC_TAC_TOE,
    status: "waiting",
  })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/games"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
        >
          ← All games
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Tic-tac-toe</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Open a table or join one waiting for an opponent.
        </p>

        <form action={createGame} className="mt-8">
          <button
            type="submit"
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white shadow transition hover:bg-violet-500"
          >
            Create game
          </button>
        </form>

        <h2 className="mt-10 text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Waiting for opponent
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            No open tables. Create one.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {waiting.map((g) => (
              <li key={String(g._id)}>
                <Link
                  href={`/games/tic-tac-toe/${String(g._id)}`}
                  className="block rounded-lg border border-neutral-200/80 px-3 py-2 text-sm hover:bg-neutral-50 dark:border-neutral-800/80 dark:hover:bg-neutral-900/50"
                >
                  Table · Host{" "}
                  <span className="font-medium">
                    {g.players[0]?.username ?? "?"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
