import { Skeleton } from "@/components/ui";

// Mirrors app/auth/page.tsx: centered max-w-[360px] sign-in card.
export default function AuthLoading() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-14">
      <main className="w-full max-w-[360px]">
        <Skeleton className="mb-10 h-3 w-20" />

        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
          <Skeleton className="mx-auto h-6 w-24" />
          <Skeleton className="mx-auto mt-3 h-4 w-56 max-w-full" />
          <Skeleton className="mt-6 h-11 w-full rounded-lg" />
          <Skeleton className="mx-auto mt-8 h-3 w-44" />
        </div>
      </main>
    </div>
  );
}
