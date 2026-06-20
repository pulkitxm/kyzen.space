import { avataaars } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import {
  type AvatarConfig,
  seedAvatarConfig,
  toDicebearOptions,
} from "@kyzen/avatar";
import { cn } from "@/lib/utils";

export function Character({
  config,
  size = 96,
  className,
  alt = "",
  fallbackSeed = "player",
}: {
  config: AvatarConfig | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
  fallbackSeed?: string;
}) {
  const resolved = config ?? seedAvatarConfig(fallbackSeed);
  const dataUri = createAvatar(
    avataaars,
    toDicebearOptions(resolved) as unknown as Parameters<
      typeof createAvatar
    >[1],
  ).toDataUri();

  return (
    // biome-ignore lint/performance/noImgElement: inline DiceBear data-URI avatar, not a next/image static asset
    <img
      src={dataUri}
      alt={alt}
      width={size}
      height={size}
      className={cn("block", className)}
    />
  );
}
