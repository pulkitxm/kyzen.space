import Link from "next/link";

import { GameCard } from "@/app/game-card";
import { SignOutForm } from "@/app/sign-out-form";
import { GAMES } from "@/lib/games";
import { getServerSession } from "@/lib/get-server-session";
import { displayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession();
  const user = session?.user ?? null;

  return (
    <div className="flex min-h-full flex-col items-center px-4 py-14">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <main className="w-full max-w-xl">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-[1.65rem]">
            GameLobby
          </h1>

          {!user ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link href="/auth" className="underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              to play with others.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <p className="text-sm font-medium text-primary">
                {(() => {
                  const d = displayName(user);
                  return d ? `Signed in as ${d}` : "Signed in";
                })()}
              </p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Link
                  href="/profile"
                  className="underline-offset-4 hover:underline"
                >
                  Profile
                </Link>
                <Link
                  href="/account"
                  className="underline-offset-4 hover:underline"
                >
                  Account
                </Link>
                <SignOutForm />
              </div>
            </div>
          )}
        </div>

        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Games
          </h2>
          <ul className="mt-3 space-y-4">
            {GAMES.map((game, i) => (
              <GameCard key={game.id} game={game} priority={i === 0} />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
