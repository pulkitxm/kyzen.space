import { PageContainer, Skeleton } from "@/components/ui";

// Mirrors app/account/page.tsx: PageContainer + back link + the account card
// (heading, email, "Active sessions" section, session rows).
export default function AccountLoading() {
  return (
    <PageContainer>
      <Skeleton className="h-4 w-20" />

      <div className="mt-8 rounded-2xl border border-border bg-card/80 p-8 shadow-xl shadow-black/5 backdrop-blur-md">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-4 w-48" />

        <section className="mt-8">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-72 max-w-full" />

          <ul className="mt-4 space-y-3">
            {[0, 1].map((i) => (
              <li
                key={i}
                className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-24 rounded-full" />
                </div>
                <div className="mt-3 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-36" />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 border-t border-border pt-6">
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>
    </PageContainer>
  );
}
