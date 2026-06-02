"use client";

import { useSyncExternalStore } from "react";
import { FaMoon, FaSun } from "react-icons/fa6";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { useColorModeSetting } from "@/lib/appearance";

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export interface ThemeToggleProps {
  collapsed: boolean;
  signedIn: boolean;
  className?: string;
}

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle({
  collapsed,
  signedIn,
  className,
}: ThemeToggleProps) {
  const mounted = useHydrated();
  const { resolvedMode, setMode } = useColorModeSetting(signedIn);

  const isDark = resolvedMode !== "light";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  const button = (
    <button
      type="button"
      onClick={() => setMode(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-full cursor-pointer items-center rounded-lg text-sidebar-foreground/70 outline-none transition-[gap,padding] duration-250 ease-in-out hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        className,
      )}
      style={{
        gap: collapsed ? 0 : 10,
        paddingLeft: collapsed ? 12 : 10,
        paddingRight: collapsed ? 12 : 10,
      }}
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
