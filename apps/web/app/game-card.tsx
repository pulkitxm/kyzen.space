import type { GameMeta } from "@gamelobby/games-core";
import Image from "next/image";
import Link from "next/link";

export function GameCard({
  game,
  priority,
}: {
  game: GameMeta;
  priority?: boolean;
}) {
  const href = `/games/${game.type}`;
  if (!game.coverImage) {
    return (
      <li>
        <Link
          href={href}
          className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl bg-card p-5 shadow-sm transition hover:bg-surface-overlay"
        >
          <h3 className="font-semibold text-card-foreground text-lg tracking-tight">
            {game.name}
          </h3>
          <p className="mt-0 max-h-0 overflow-hidden text-muted-foreground text-sm leading-snug opacity-0 transition-all duration-300 group-hover:mt-1.5 group-hover:max-h-24 group-hover:opacity-100">
            {game.description}
          </p>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={href}
        className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-2xl bg-surface-raised shadow-[0_8px_30px_-8px_rgb(0_0_0/0.12)] outline-none ring-offset-background transition hover:shadow-[0_12px_40px_-12px_rgb(0_0_0/0.18)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Image
          src={game.coverImage}
          alt={`${game.name} artwork`}
          fill
          className="object-cover object-center"
          sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 30rem"
          priority={priority}
        />
        <div
          className="absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent"
          aria-hidden
        />
        <div className="relative p-5">
          <h3 className="font-semibold text-white text-lg tracking-tight drop-shadow-sm">
            {game.name}
          </h3>
          <p className="mt-0 max-h-0 overflow-hidden text-sm text-white/75 leading-snug opacity-0 transition-all duration-300 group-hover:mt-1.5 group-hover:max-h-24 group-hover:opacity-100 group-focus-visible:mt-1.5 group-focus-visible:max-h-24 group-focus-visible:opacity-100">
            {game.description}
          </p>
        </div>
      </Link>
    </li>
  );
}
