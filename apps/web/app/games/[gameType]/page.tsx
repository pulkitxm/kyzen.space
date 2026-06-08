import { getDefinition, hasEngine } from "@gamelobby/games-core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GameLobby } from "@/app/games/_shared/game-lobby";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";
import { getServerSession } from "@/lib/get-server-session";

export const metadata: Metadata = {
  title: "Game lobby",
  description: "Pick a friend or group chat to start a multiplayer game with.",
};

export const dynamic = "force-dynamic";

export default async function GameLobbyPage({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!hasEngine(gameType)) notFound();

  const def = getDefinition(gameType);
  const session = await getServerSession();

  return (
    <PageContainer>
      <BackLink href="/">← All games</BackLink>
      <div className="mt-6">
        <PageHeader
          title={def.meta.name}
          description="Games happen inside your chats — pick a friend or group to play with."
        />
      </div>

      <GameLobby
        meta={def.meta}
        configFields={def.configFields ?? []}
        userId={session?.user?.id ?? null}
      />

      <p className="mt-6 max-w-md text-muted-foreground text-sm">
        Starting a game posts a game card into that conversation and opens it
        side-by-side with the chat. You can also start one from the game button
        in any conversation, or jump straight to{" "}
        <Link href="/chat" className="text-primary hover:underline">
          your chats
        </Link>
        .
      </p>
    </PageContainer>
  );
}
