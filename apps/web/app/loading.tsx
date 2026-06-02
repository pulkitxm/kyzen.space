import { Skeleton } from "@/components/ui";

export default function HomeLoading() {
  return (
    <div className="flex min-h-full flex-col items-center px-4 py-14">
      <main className="w-full max-w-5xl">
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="aspect-4/3 w-full rounded-2xl" />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
