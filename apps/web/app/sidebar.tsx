"use client";

import type { AvatarConfig } from "@gamelobby/avatar";
import { useAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaGamepad,
  FaUser,
} from "react-icons/fa";
import { SidebarSocialNav } from "@/app/sidebar-social-nav";
import { ThemeToggle } from "@/app/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { Character } from "@/components/ui";
import { getCategoryGroups } from "@/lib/games";
import {
  clampWidthSafe,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  sidebarCollapsedAtom,
  sidebarWidthAtom,
} from "@/lib/sidebar-atoms";
import type { SidebarPrefs } from "@/lib/sidebar-prefs";
import { persistSidebarPrefsToCookie } from "@/lib/sidebar-prefs";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  sidebarPrefsTrusted: boolean;
  sidebarPrefs: SidebarPrefs;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  username: string | null;
  avatar: AvatarConfig | null;
  signedIn: boolean;
  profileHref: string;
}

export function Sidebar({
  sidebarPrefsTrusted,
  sidebarPrefs,
  mobileOpen,
  onCloseMobile,
  username,
  avatar,
  signedIn,
  profileHref,
}: SidebarProps) {
  const pathname = usePathname();
  const atomsToHydrate = sidebarPrefsTrusted
    ? new Map<
        typeof sidebarCollapsedAtom | typeof sidebarWidthAtom,
        boolean | number
      >([
        [sidebarCollapsedAtom, sidebarPrefs.collapsed],
        [sidebarWidthAtom, clampWidthSafe(sidebarPrefs.width)],
      ])
    : new Map();
  useHydrateAtoms(atomsToHydrate);
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
  const [width, setWidth] = useAtom(sidebarWidthAtom);
  const clientReady = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const layoutKnown = sidebarPrefsTrusted || clientReady;
  const displayCollapsed = layoutKnown ? collapsed : false;
  const displayWidth = layoutKnown ? width : DEFAULT_SIDEBAR_WIDTH;
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    persistSidebarPrefsToCookie({ collapsed, width });
  }, [collapsed, width]);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeStartXRef = useRef<number>(0);
  const hasResizedThisGestureRef = useRef(false);
  const resizeStartedFromCollapsedRef = useRef(false);

  const groups = getCategoryGroups();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  const resetToDefaultWidth = useCallback(() => {
    setWidth(DEFAULT_SIDEBAR_WIDTH);
  }, [setWidth]);

  const handleResizeHandleClick = useCallback(() => {
    if (!collapsed && hasResizedThisGestureRef.current) return;
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return;
    }
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      toggleCollapsed();
    }, 250);
  }, [toggleCollapsed, collapsed]);

  const handleResizeHandleDoubleClick = useCallback(() => {
    if (hasResizedThisGestureRef.current) return;
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    if (!collapsed) resetToDefaultWidth();
  }, [collapsed, resetToDefaultWidth]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        )
          return;
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleCollapsed]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeStartXRef.current = e.clientX;
      hasResizedThisGestureRef.current = false;
      resizeStartedFromCollapsedRef.current = collapsed;
      setIsResizing(true);
    },
    [collapsed],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = Math.abs(e.clientX - resizeStartXRef.current);
      if (deltaX > 5) hasResizedThisGestureRef.current = true;
      if (resizeStartedFromCollapsedRef.current) {
        if (e.clientX >= MIN_SIDEBAR_WIDTH) {
          const newWidth = Math.min(
            MAX_SIDEBAR_WIDTH,
            Math.max(MIN_SIDEBAR_WIDTH, e.clientX),
          );
          setWidth(newWidth);
          setCollapsed(false);
          resizeStartedFromCollapsedRef.current = false;
        }
        return;
      }
      if (e.clientX < MIN_SIDEBAR_WIDTH) return;
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, e.clientX),
      );
      setWidth(newWidth);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (
        !resizeStartedFromCollapsedRef.current &&
        e.clientX < MIN_SIDEBAR_WIDTH
      )
        toggleCollapsed();
      resizeStartedFromCollapsedRef.current = false;
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setCollapsed, setWidth, toggleCollapsed]);

  const collapsedWidth = 68;
  const navPx = 8;
  const navMx = 4;
  const iconSize = 16;
  const centeredPad = (collapsedWidth - navPx * 2 - navMx * 2 - iconSize) / 2;

  const textClasses = cn(
    "overflow-hidden whitespace-nowrap transition-[opacity,max-width,filter] duration-250 ease-in-out",
    displayCollapsed
      ? "max-w-0 opacity-0 blur-[2px]"
      : "max-w-48 opacity-100 blur-0",
  );

  return (
    <aside
      className={cn(
        "relative flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar",
        "fixed inset-y-0 left-0 z-50 w-64 md:relative md:z-auto md:w-(--sidebar-width)",
        !mobileOpen && "hidden md:flex",
      )}
      style={
        {
          "--sidebar-width": `${displayCollapsed ? collapsedWidth : displayWidth}px`,
          transition: isResizing ? "none" : "width 0.25s ease-in-out",
        } as React.CSSProperties
      }
    >
      <div
        className={cn(
          "group absolute top-0 -right-2 z-10 hidden h-full w-4 cursor-col-resize md:block",
        )}
      >
        <button
          type="button"
          className="size-full"
          onMouseDown={handleResizeStart}
          onClick={handleResizeHandleClick}
          onDoubleClick={handleResizeHandleDoubleClick}
          aria-label="Resize sidebar"
        />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="absolute top-1/2 right-0 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-sidebar-border bg-sidebar p-1 text-sidebar-foreground/70 opacity-0 shadow-sm transition-opacity hover:bg-sidebar-accent hover:text-sidebar-foreground group-hover:opacity-100"
          aria-label={displayCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {displayCollapsed ? (
            <FaChevronRight className="size-2" />
          ) : (
            <FaChevronLeft className="size-2" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-hidden border-b border-sidebar-border px-3 py-3.5">
        <Link
          href="/"
          onClick={onCloseMobile}
          className="flex min-w-0 items-center rounded-lg transition-[gap,padding,opacity] duration-250 ease-in-out hover:opacity-90"
          style={{
            gap: displayCollapsed ? 0 : 10,
            paddingLeft: displayCollapsed ? 8 : 0,
          }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold select-none">
            GL
          </span>
          <span
            className={cn(
              "font-semibold text-sidebar-foreground text-sm",
              textClasses,
            )}
          >
            GameLobby
          </span>
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCloseMobile}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
          aria-label="Close menu"
        >
          <FaChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <nav
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-3"
        aria-label="Navigation"
      >
        {signedIn ? (
          <SidebarSocialNav
            collapsed={displayCollapsed}
            onNavigate={onCloseMobile}
          />
        ) : null}
        {groups.map(({ category, games }) => (
          <div key={category.id} className="mb-4">
            <div
              className={cn(
                "mb-1 px-2.5 py-1 font-medium text-sidebar-foreground/60 text-xs uppercase tracking-wider",
                textClasses,
              )}
            >
              {category.label}
            </div>
            <div className="flex flex-col gap-1">
              {games.map((game) => {
                const isActive = pathname.startsWith(game.href);
                const link = (
                  <Link
                    key={game.href}
                    href={game.href}
                    onClick={onCloseMobile}
                    className={cn(
                      "mx-1 flex h-9 cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg text-sm transition-[padding,background-color,border-color] duration-250 ease-in-out",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      !displayCollapsed &&
                        isActive &&
                        "border-l-2 border-sidebar-primary",
                      !(displayCollapsed || isActive) &&
                        "border-l-2 border-transparent",
                    )}
                    style={{
                      paddingLeft: displayCollapsed
                        ? `${centeredPad}px`
                        : isActive
                          ? "8px"
                          : "10px",
                      paddingRight: displayCollapsed
                        ? `${centeredPad}px`
                        : "10px",
                    }}
                  >
                    <span
                      className={cn(
                        "flex shrink-0",
                        isActive && "text-sidebar-primary",
                      )}
                    >
                      <FaGamepad className="h-4 w-4 shrink-0" />
                    </span>
                    <span className={cn("font-medium", textClasses)}>
                      {game.name}
                    </span>
                  </Link>
                );
                return displayCollapsed ? (
                  <Tooltip key={game.href}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{game.name}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Fragment key={game.href}>{link}</Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-2 py-3">
        <div className="mb-2">
          <ThemeToggle collapsed={displayCollapsed} />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={profileHref}
              onClick={onCloseMobile}
              className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg outline-none transition-[gap,padding] duration-250 ease-in-out hover:bg-sidebar-accent"
              style={{
                gap: displayCollapsed ? 0 : 10,
                paddingLeft: displayCollapsed ? 12 : 10,
                paddingRight: displayCollapsed ? 12 : 10,
              }}
              aria-label={signedIn ? "View profile" : "Sign in"}
            >
              <div
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-medium",
                  signedIn
                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                    : "bg-sidebar-accent text-sidebar-foreground/60",
                )}
              >
                {signedIn ? (
                  <Character
                    config={avatar}
                    fallbackSeed={username ?? "player"}
                    size={28}
                    className="size-full"
                  />
                ) : (
                  <FaUser className="size-3" />
                )}
              </div>
              <span
                className={cn(
                  "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left text-sidebar-foreground/80 text-sm transition-[opacity,max-width,filter] duration-250 ease-in-out",
                  displayCollapsed
                    ? "max-w-0 opacity-0 blur-[2px]"
                    : "max-w-48 opacity-100 blur-0",
                )}
              >
                {signedIn ? (username ?? "Profile") : "Sign in"}
              </span>
            </Link>
          </TooltipTrigger>
          {displayCollapsed ? (
            <TooltipContent side="right">
              {signedIn ? (username ?? "Profile") : "Sign in"}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </div>
    </aside>
  );
}
