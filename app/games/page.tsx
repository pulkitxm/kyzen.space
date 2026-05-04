import Link from "next/link";

export default function GamesIndexPage() {
  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto max-w-lg">
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
        <ul className="mt-8 space-y-3">
          <li>
            <Link
              href="/games/tic-tac-toe"
              className="block rounded-xl border border-neutral-200/90 bg-white/60 px-4 py-4 font-medium shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40 dark:hover:bg-neutral-900/60"
            >
              Tic-tac-toe
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
