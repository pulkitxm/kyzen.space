"use client";

export function ConnectionDot({ online }: { online: boolean }) {
  const tone = online ? "bg-success" : "bg-danger";
  return (
    <output
      className="relative inline-flex size-3 items-center justify-center"
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
    >
      <span
        className={`absolute inline-flex size-3 animate-ping rounded-full opacity-70 motion-reduce:animate-none ${tone}`}
      />
      <span className={`relative inline-flex size-2.5 rounded-full ${tone}`} />
    </output>
  );
}
