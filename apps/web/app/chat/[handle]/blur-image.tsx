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
      {/* biome-ignore lint/a11y/useAltText: alt provided via prop */}
      <img
        src={src}
        alt={alt}
        loading={loading}
        className="animate-gif-fade-in relative block h-full w-full object-cover"
      />
    </span>
  );
}
