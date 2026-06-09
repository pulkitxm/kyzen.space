"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";

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
  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-surface-overlay",
        className,
      )}
      style={{ aspectRatio }}
    >
      {blurPreview ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 scale-110 bg-center bg-cover blur-lg"
          style={{ backgroundImage: `url("${blurPreview}")` }}
        />
      ) : (
        <span className="absolute inset-0 animate-pulse bg-surface-overlay" />
      )}
      {/* biome-ignore lint/performance/noImgElement: GIF with dynamic remote src and blur placeholder, not a next/image static asset */}
      <m.img
        src={src}
        alt={alt}
        loading={loading}
        className="relative block h-full w-full object-cover"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      />
    </span>
  );
}
