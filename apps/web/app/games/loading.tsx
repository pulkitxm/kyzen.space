import { PageContainer, Skeleton } from "@/components/ui";

export default function GamesLoading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-20" />
      <div className="mt-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </div>
      <ul className="mt-8 space-y-4">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex min-h-[8.5rem] overflow-hidden rounded-2xl border border-border bg-surface-raised"
          >
            <Skeleton className="aspect-[5/6] min-h-[8.5rem] w-[44%] max-w-[11rem] shrink-0 rounded-none" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 px-5 py-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full max-w-[16rem]" />
              <Skeleton className="mt-2 h-4 w-14" />
            </div>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
