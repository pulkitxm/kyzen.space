"use client";

import { avataaars } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import {
  type AvatarConfig,
  seedAvatarConfig,
  toDicebearOptions,
} from "@gamelobby/avatar";
import { useMemo } from "react";

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
  const dataUri = useMemo(() => {
    const resolved = config ?? seedAvatarConfig(fallbackSeed);
    return createAvatar(
      avataaars,
      toDicebearOptions(resolved) as unknown as Parameters<
        typeof createAvatar
      >[1],
    ).toDataUri();
  }, [config, fallbackSeed]);

  return (
    <img
      src={dataUri}
      alt={alt}
      width={size}
      height={size}
      className={["block", className].filter(Boolean).join(" ")}
    />
  );
}
