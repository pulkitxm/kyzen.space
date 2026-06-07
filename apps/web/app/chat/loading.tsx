import { Skeleton } from "@/components/ui";

export default function ChatListLoading() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="flex items-center justify-between border-border border-b px-4 py-3.5">
        <Skeleton className="h-6 w-28" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-border/60 border-b px-4 py-3"
          >
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-10" />
              </div>
              <Skeleton className="h-3 w-48 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
