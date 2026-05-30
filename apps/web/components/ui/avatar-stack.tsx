import type { AvatarConfig } from "@gamelobby/avatar";
import { Character } from "@/components/ui";
import { cn } from "@/lib/utils";

/** A DiceBear character with an optional online/offline presence dot. */
export function PresenceAvatar({
  config,
  seed,
  size = 36,
  online,
  className,
}: {
  config: AvatarConfig | null | undefined;
  seed: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Character
        config={config}
        fallbackSeed={seed}
        size={size}
        className="rounded-full bg-surface-overlay"
      />
      {online !== undefined ? (
        <span
          className={cn(
            "absolute right-0 bottom-0 size-3 rounded-full border-2 border-card",
            online ? "bg-emerald-500" : "bg-muted-foreground/40",
          )}
        />
      ) : null}
    </span>
  );
}

/** Overlapping characters for groups / multiple typers. */
export function AvatarStack({
  users,
  size = 28,
  max = 3,
}: {
  users: { id: string; avatar: AvatarConfig | null; seed: string }[];
  size?: number;
  max?: number;
}) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((u, i) => (
        <Character
          key={u.id}
          config={u.avatar}
          fallbackSeed={u.seed}
          size={size}
          className={cn(
            "rounded-full border-2 border-card bg-surface-overlay",
            i > 0 && "-ml-2",
          )}
        />
      ))}
      {extra > 0 ? (
        <span
          className="-ml-2 flex items-center justify-center rounded-full border-2 border-card bg-surface-overlay text-[10px] font-medium text-muted-foreground"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
