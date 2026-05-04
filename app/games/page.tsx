import Link from "next/link";

import { GameCard } from "@/app/game-card";
import { GAMES } from "@/lib/games";

export default function GamesIndexPage() {
  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link
          href="/"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
        >
          ← Home
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Games</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Pick a game to play live with another player.
        </p>
        <ul className="mt-8 space-y-4">
          {GAMES.map((game, i) => (
            <GameCard key={game.id} game={game} priority={i === 0} />
          ))}
        </ul>
      </div>
    </div>
  );
}
