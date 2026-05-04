import Image from "next/image";
import Link from "next/link";

import type { GameEntry } from "@/lib/games";

export function GameCard({
  game,
  priority,
}: {
  game: GameEntry;
  priority?: boolean;
}) {
  if (!game.coverImage) {
    return (
      <li>
        <Link
          href={game.href}
          className="group flex items-center justify-between rounded-2xl border border-neutral-200/90 bg-white/60 px-5 py-4 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950/40 dark:hover:bg-neutral-900/60"
        >
          <div>
            <p className="font-medium text-neutral-950 dark:text-neutral-50">
              {game.name}
            </p>
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              {game.description}
            </p>
          </div>
          <span className="ml-4 text-neutral-400 transition group-hover:translate-x-0.5 group-hover:text-neutral-600 dark:group-hover:text-neutral-300">
            →
          </span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={game.href}
        className="group relative flex min-h-[8.5rem] overflow-hidden rounded-2xl border border-neutral-200/90 bg-neutral-950 shadow-[0_8px_30px_-8px_rgb(0_0_0/0.65)] outline-none ring-offset-white transition hover:border-[#2E78F2]/45 hover:shadow-[0_12px_40px_-12px_rgb(46_120_242/0.35)] focus-visible:ring-2 focus-visible:ring-[#2E78F2] focus-visible:ring-offset-2 dark:border-neutral-800 dark:ring-offset-neutral-950"
      >
        <div className="relative aspect-[5/6] min-h-[8.5rem] w-[44%] max-w-[11rem] shrink-0 sm:aspect-auto sm:h-auto sm:min-h-0">
          <Image
            src={game.coverImage}
            alt={`${game.name} artwork`}
            fill
            className="object-cover object-center transition duration-300 group-hover:scale-[1.03]"
            sizes="(max-width:640px) 44vw, 11rem"
            priority={priority}
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-r from-transparent to-neutral-950 sm:w-14"
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#F56217]/90">
            Live multiplayer
          </p>
          <h3 className="text-lg font-semibold tracking-tight text-neutral-50">
            {game.name}
          </h3>
          <p className="text-sm leading-snug text-neutral-400">{game.description}</p>
          <p className="mt-3 text-sm font-medium text-[#5B9BFF] transition group-hover:text-[#78AEFF]">
            Play<span className="ml-1 transition group-hover:translate-x-px">→</span>
          </p>
        </div>
      </Link>
    </li>
  );
}
