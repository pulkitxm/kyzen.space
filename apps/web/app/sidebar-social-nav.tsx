"use client";

import { useAtomValue } from "jotai";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import { FaComments } from "react-icons/fa6";
import { totalUnreadAtom } from "@/lib/chat/atoms";
import { cn } from "@/lib/utils";

export function SidebarSocialNav({
  collapsed,
  collapsedPad,
  onNavigate,
}: {
  collapsed: boolean;
  collapsedPad: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const unread = useAtomValue(totalUnreadAtom);

  const items: {
    href: string;
    label: string;
    icon: IconType;
    badge: number;
  }[] = [{ href: "/chat", label: "Chat", icon: FaComments, badge: unread }];

  return (
    <div className="mb-4">
      <div
        className={cn(
          "mb-1 overflow-hidden whitespace-nowrap px-2.5 py-1 font-medium text-sidebar-foreground/60 text-xs uppercase tracking-wider transition-[max-width,opacity,filter] duration-250 ease-in-out",
          collapsed
            ? "max-w-0 opacity-0 blur-[2px]"
            : "max-w-48 opacity-100 blur-0",
        )}
      >
        Social
      </div>
      <div className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "relative mx-1 flex h-9 items-center gap-2.5 overflow-hidden rounded-lg text-sm transition-[padding,background-color,border-color] duration-250 ease-in-out",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
              style={{
                paddingLeft: collapsed ? collapsedPad : 10,
                paddingRight: collapsed ? collapsedPad : 10,
              }}
              aria-label={label}
            >
              <span
                className={cn(
                  "relative flex shrink-0",
                  active && "text-sidebar-primary",
                )}
              >
                <Icon className="size-4" />
                {badge > 0 && collapsed ? (
                  <span className="absolute -top-1.5 -right-1.5 size-2 rounded-full bg-primary" />
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left font-medium transition-[opacity,max-width,filter] duration-250 ease-in-out",
                  collapsed
                    ? "max-w-0 opacity-0 blur-[2px]"
                    : "max-w-48 opacity-100 blur-0",
                )}
              >
                {label}
              </span>
              {!collapsed && badge > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 font-semibold text-[10px] text-primary-foreground">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
