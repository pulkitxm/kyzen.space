import { serverFetchJson } from "@/lib/api-server";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

import { PlayButton } from "@/app/games/tic-tac-toe/play-button";

export const dynamic = "force-dynamic";

type WaitingGame = {
  id: string;
  players: { userId: string; username: string; role: string }[];
};

export default async function TicTacToeLobbyPage() {
  const data = await serverFetchJson<{ games: WaitingGame[] }>(
    "/api/games?gameType=tic-tac-toe&status=waiting",
  );
  const waiting = data?.games ?? [];

  return (
    <PageContainer>
      <BackLink href="/games">← All games</BackLink>
      <div className="mt-6">
        <PageHeader
          title="Tic-tac-toe"
          description="Open a table or join one waiting for an opponent."
        />
      </div>

      <div className="mt-8 max-w-sm">
        <PlayButton />
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Waiting for opponent
      </h2>
      {waiting.length === 0 ? (
        <div className="mt-3 max-w-md">
          <EmptyState
            title="No open tables"
            description="Start one with Play and an opponent can join."
          />
        </div>
      ) : (
        <ul className="mt-3 max-w-md space-y-2">
          {waiting.map((g) => (
            <li key={g.id}>
              <Link
                href={`/games/tic-tac-toe/${g.id}`}
                className="block rounded-lg border border-border px-3 py-2 text-sm text-card-foreground transition hover:bg-surface-overlay"
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
    </PageContainer>
  );
}
