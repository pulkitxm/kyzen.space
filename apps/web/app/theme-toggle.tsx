"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { FaMoon, FaSun } from "react-icons/fa";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export interface ThemeToggleProps {
  collapsed: boolean;
  className?: string;
}

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Matches typical next-themes wiring: cycles explicit light ↔ dark via `resolvedTheme`. */
export function ThemeToggle({ collapsed, className }: ThemeToggleProps) {
  const mounted = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const button = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg text-sidebar-foreground/70 outline-none transition-[gap,padding] duration-250 ease-in-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        collapsed ? "justify-center px-0" : "px-2.5",
        className,
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center">
        {!mounted ? (
          <span
            className="size-4 rounded-sm bg-sidebar-foreground/15"
            aria-hidden
          />
        ) : isDark ? (
          <FaSun className="size-4 shrink-0" aria-hidden />
        ) : (
          <FaMoon className="size-4 shrink-0" aria-hidden />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left text-sidebar-foreground/90 text-sm transition-[opacity,max-width,filter] duration-250 ease-in-out",
          collapsed
            ? "max-w-0 opacity-0 blur-[2px]"
            : "max-w-48 opacity-100 blur-0",
        )}
      >
        Appearance
      </span>
    </button>
  );

  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    button
  );
}
