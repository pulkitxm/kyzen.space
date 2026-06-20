import { Skeleton } from "@/components/ui";

const BUBBLES = [
  { id: "in-1", mine: false, w: "60%" },
  { id: "out-1", mine: true, w: "45%" },
  { id: "in-2", mine: false, w: "70%" },
  { id: "out-2", mine: true, w: "35%" },
  { id: "in-3", mine: false, w: "50%" },
  { id: "out-3", mine: true, w: "55%" },
];

export default function ConversationLoading() {
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
      <header className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {BUBBLES.map((b) => (
          <div
            key={b.id}
            className={b.mine ? "flex justify-end" : "flex justify-start"}
          >
            <Skeleton
              className="h-10 rounded-2xl"
              style={{ width: b.w, maxWidth: "75%" }}
            />
          </div>
        ))}
      </div>

      <div className="border-border border-t p-3">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}
