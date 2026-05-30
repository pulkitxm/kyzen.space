"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Blur-up image: paints the provider's tiny base64 `blurPreview` (or a pulse
 * skeleton when none is given), then fades the real image in over it once it
 * loads. The box is reserved from `aspectRatio` so layout never shifts.
 */
export function BlurImage({
  src,
  blurPreview,
  alt,
  aspectRatio,
  className,
  loading,
}: {
  src: string;
  blurPreview?: string;
  alt: string;
  aspectRatio: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span
      className={cn("relative block overflow-hidden", className)}
      style={{ aspectRatio }}
    >
      {blurPreview ? (
        // biome-ignore lint/a11y/useAltText: decorative blur placeholder
        <img
          src={blurPreview}
          alt=""
          aria-hidden="true"
          className={cn(
            "absolute inset-0 h-full w-full scale-110 object-cover blur-lg transition-opacity duration-500",
            loaded && "opacity-0",
          )}
        />
      ) : (
        <span
          className={cn(
            "absolute inset-0 animate-pulse bg-surface-overlay transition-opacity duration-500",
            loaded && "opacity-0",
          )}
        />
      )}
      {/* biome-ignore lint/a11y/useAltText: alt provided via prop */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setLoaded(true)}
        className={cn(
          "relative h-full w-full object-cover opacity-0 transition-opacity duration-500",
          loaded && "opacity-100",
        )}
      />
    </span>
  );
}
