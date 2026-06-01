import { PageContainer, Skeleton } from "@/components/ui";

// Mirrors app/games/[gameType]/page.tsx: PageContainer + back link + header +
// the GameLobby setup form (max-w-sm: a couple of field rows + Play button).
export default function GameLobbyLoading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-24" />
      <div className="mt-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>

      <div className="mt-8 max-w-sm space-y-6">
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>

      <Skeleton className="mt-6 h-4 w-full max-w-md" />
    </PageContainer>
  );
}
