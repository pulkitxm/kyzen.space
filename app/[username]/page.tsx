import Link from "next/link";
import { notFound } from "next/navigation";

import { connectMongoose } from "@/database/mongoose";
import { Game, UserProfile } from "@/database/models";

const RESERVED = new Set([
  "api",
  "auth",
  "account",
  "games",
  "profile",
  "_next",
  "favicon.ico",
]);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  if (RESERVED.has(username.toLowerCase())) notFound();

  await connectMongoose();
  const profile = await UserProfile.findOne({
    username: new RegExp(`^${escapeRegex(username)}$`, "i"),
  }).lean();

  if (!profile) notFound();

  const games = await Game.find({ "players.userId": profile.userId })
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean();

  const rawStats = profile.stats;
  const statsObj =
    rawStats &&
    typeof rawStats === "object" &&
    !(rawStats instanceof Map)
      ? (rawStats as Record<string, unknown>)
      : rawStats instanceof Map
        ? Object.fromEntries(rawStats.entries())
        : {};

  return (
    <div className="min-h-full px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="text-sm text-neutral-500 underline-offset-4 hover:underline dark:text-neutral-400"
        >
          ← Home
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {profile.username}
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Player profile
        </p>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Stats by game
          </h2>
          {Object.keys(statsObj).length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              No games played yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {Object.entries(statsObj).map(([gameType, s]) => (
                <li
                  key={gameType}
                  className="rounded-lg border border-neutral-200/80 px-3 py-2 text-sm dark:border-neutral-800/80"
                >
                  <span className="font-medium capitalize">
                    {gameType.replace(/-/g, " ")}
                  </span>
                  <span className="ml-2 text-neutral-600 dark:text-neutral-400">
                    {formatStat(s)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Recent games
          </h2>
          {games.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              No games yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {games.map((g) => (
                <li key={String(g._id)}>
                  <Link
                    href={`/games/tic-tac-toe/${String(g._id)}`}
                    className="block rounded-lg border border-neutral-200/80 px-3 py-2 text-sm transition hover:bg-neutral-50 dark:border-neutral-800/80 dark:hover:bg-neutral-900/50"
                  >
                    <span className="font-medium capitalize">
                      {g.gameType.replace(/-/g, " ")}
                    </span>
                    <span className="ml-2 text-neutral-500">
                      {g.status}
                      {g.winner
                        ? ` · ${g.winner === "draw" ? "Draw" : "Winner decided"}`
                        : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatStat(s: unknown): string {
  if (!s || typeof s !== "object") return "";
  const o = s as Record<string, number>;
  return `played ${o.played ?? 0} · won ${o.won ?? 0} · lost ${o.lost ?? 0} · drawn ${o.drawn ?? 0}`;
}
