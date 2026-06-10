import { getDefinition, hasEngine } from "@gamelobby/games-core";
import type { GameJson } from "@gamelobby/shared/types";
import Image from "next/image";
import Link from "next/link";
import { Character } from "@/components/ui";

function StatusChip({ status }: { status: string }) {
  const waiting = status === "waiting";
  return (
    <span
      className={[
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-xs",
        waiting
          ? "bg-warning/15 text-warning-foreground"
          : "bg-success-label-bg text-success-label-text",
      ].join(" ")}
    >
      <span
        className={`size-1.5 rounded-full ${waiting ? "bg-warning" : "bg-success"}`}
        aria-hidden
      />
      {waiting ? "Waiting for opponent" : "In progress"}
    </span>
  );
}

export function JumpBackIn({
  games,
  userId,
}: {
  games: GameJson[];
  userId: string;
}) {
  const playable = games.filter((g) => hasEngine(g.gameType));
  if (playable.length === 0) return null;

  return (
    <section aria-labelledby="jump-back-in" className="mb-10">
      <h2
        id="jump-back-in"
        className="mb-3 font-semibold text-foreground text-lg tracking-tight"
      >
        Jump back in
      </h2>
      <ul className="flex gap-4 overflow-x-auto pb-2">
        {playable.map((g) => {
          const meta = getDefinition(g.gameType).meta;
          const opponent = g.players.find((p) => p.userId !== userId) ?? null;
          return (
            <li key={g.id} className="min-w-64 flex-1 sm:max-w-80">
              <Link
                href={`/play/${g.id}`}
                className="group flex items-center gap-3.5 rounded-2xl border border-border bg-surface-raised p-3.5 shadow-sm outline-none transition duration-200 hover:-translate-y-0.5 hover:bg-surface-overlay hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
              >
                {meta.coverImage ? (
                  <Image
                    src={meta.coverImage}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-surface-overlay font-semibold text-muted-foreground">
                    {meta.name.slice(0, 1)}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium text-card-foreground text-sm">
                    {meta.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    {opponent ? (
                      <>
                        <Character
                          config={opponent.avatar ?? null}
                          fallbackSeed={opponent.username}
                          size={16}
                          className="size-4 rounded-full"
                        />
                        <span className="truncate">vs {opponent.username}</span>
                      </>
                    ) : (
                      "No opponent yet"
                    )}
                  </span>
                  <StatusChip status={g.status} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
