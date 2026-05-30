import { notFound } from "next/navigation";
import { PageContainer } from "@/components/ui/page";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";

import { type TicTacToeClientProps, TicTacToeGameClient } from "./game-client";

type GamePayload = {
  game: TicTacToeClientProps["initialGame"];
  moves: TicTacToeClientProps["initialMoves"];
};

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ gameId: string }> };

export default async function TicTacToeGamePage({ params }: Props) {
  const { gameId } = await params;
  if (!UUID_RE.test(gameId)) notFound();

  const [data, session] = await Promise.all([
    serverFetchJson<GamePayload>(`/api/games/${gameId}`),
    getServerSession(),
  ]);
  if (!data) notFound();

  return (
    <PageContainer size="sm">
      <TicTacToeGameClient
        gameId={gameId}
        userId={session?.user?.id ?? null}
        initialGame={data.game}
        initialMoves={data.moves}
      />
    </PageContainer>
  );
}
