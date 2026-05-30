import Link from "next/link";
import { PlayButton } from "@/app/games/tic-tac-toe/play-button";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";
import { getServerSession } from "@/lib/get-server-session";

export const dynamic = "force-dynamic";

export default async function TicTacToeLobbyPage() {
  const session = await getServerSession();

  return (
    <PageContainer>
      <BackLink href="/games">← All games</BackLink>
      <div className="mt-6">
        <PageHeader
          title="Tic-tac-toe"
          description="Games happen inside your chats — pick a friend or group to play with."
        />
      </div>

      <div className="mt-8 max-w-sm">
        <PlayButton userId={session?.user?.id ?? null} />
      </div>

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
