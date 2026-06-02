import { Skeleton } from "@/components/ui";

export default function FriendsLoading() {
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="border-border border-b px-4 pt-4">
        <Skeleton className="mb-3 h-6 w-24" />
        <div className="flex gap-1">
          {[16, 20, 12].map((w, i) => (
            <Skeleton
              key={i}
              className="h-9 rounded-t-lg"
              style={{ width: `${w * 4}px` }}
            />
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ul className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="size-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
