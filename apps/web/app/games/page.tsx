import { listGameMeta } from "@gamelobby/games-core";
import { GameCard } from "@/app/game-card";
import { BackLink, PageContainer, PageHeader } from "@/components/ui/page";

export default function GamesIndexPage() {
  return (
    <PageContainer>
      <BackLink href="/">← Home</BackLink>
      <div className="mt-6">
        <PageHeader
          title="Games"
          description="Pick a game to play live with another player."
        />
      </div>
      <ul className="mt-8 space-y-4">
        {listGameMeta().map((game, i) => (
          <GameCard key={game.type} game={game} priority={i === 0} />
        ))}
      </ul>
    </PageContainer>
  );
}
