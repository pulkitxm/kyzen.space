import { getCategoryGroups } from "@gamelobby/games-core";
import type { GameJson } from "@gamelobby/shared/types";
import type { Metadata } from "next";
import { GameCard } from "@/app/game-card";
import { JumpBackIn } from "@/app/jump-back-in";
import { Reveal } from "@/components/motion/reveal";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";

export const metadata: Metadata = {
  title: "GameLobby: Play live multiplayer games",
  description:
    "Browse the game library and start a live multiplayer match with your friends.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession();
  const user = session?.user ?? null;

  const live = user
    ? await serverFetchJson<{ games: GameJson[] }>("/api/games/mine")
    : null;
  const liveGames = live?.games ?? [];
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null;
  const groups = getCategoryGroups();

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-130 -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <main className="w-full max-w-5xl">
        <Reveal>
          <header className="mb-10">
            <h1 className="font-bold text-3xl text-foreground tracking-tight">
              {user
                ? `Welcome back${firstName ? `, ${firstName}` : ""}`
                : "Play together, instantly"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {user
                ? "Pick up where you left off, or start something new."
                : "Live multiplayer games with friends - right in your browser, nothing to install."}
            </p>
          </header>
        </Reveal>

        {user && liveGames.length > 0 ? (
          <Reveal delay={0.06}>
            <JumpBackIn games={liveGames} userId={user.id} />
          </Reveal>
        ) : null}

        {groups.map((group, i) => (
          <Reveal key={group.category.id} delay={0.1 + i * 0.05}>
            <section
              aria-labelledby={`category-${group.category.id}`}
              className="mb-12"
            >
              <div className="mb-3 flex items-baseline gap-2.5">
                <h2
                  id={`category-${group.category.id}`}
                  className="font-semibold text-foreground text-lg tracking-tight"
                >
                  {group.category.label}
                </h2>
                <span className="text-muted-foreground text-sm">
                  {group.games.length}{" "}
                  {group.games.length === 1 ? "game" : "games"}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.games.map((game, j) => (
                  <GameCard
                    key={game.type}
                    game={game}
                    priority={i + j === 0}
                  />
                ))}
              </ul>
            </section>
          </Reveal>
        ))}
      </main>
    </div>
  );
}
