import { listGameMeta } from "@kyzen/games-core";
import type { Metadata } from "next";
import { GameCard } from "@/app/game-card";

export const metadata: Metadata = {
  title: "Kyzen: Play live multiplayer games",
  description:
    "Browse the game library and start a live multiplayer match with your friends.",
};

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-130 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <main className="w-full max-w-5xl">
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listGameMeta().map((game, i) => (
            <GameCard key={game.type} game={game} priority={i === 0} />
          ))}
        </ul>
      </main>
    </div>
  );
}
