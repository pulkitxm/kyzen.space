"use client";

export function PanelHeading({ children }: { children: string }) {
  return (
    <h3 className="px-1 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
      {children}
    </h3>
  );
}
