import { Skeleton } from "@/components/ui";

// Mirrors app/notifications/notifications-client.tsx: full-height max-w-4xl
// column with a bordered header and a list of notification rows.
export default function NotificationsLoading() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="flex items-center justify-between border-border border-b px-4 py-3.5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-border/60 border-b px-4 py-3"
          >
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
