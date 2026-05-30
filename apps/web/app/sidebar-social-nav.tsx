"use client";

import { useAtomValue } from "jotai";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import { FaBell, FaComments, FaUserFriends } from "react-icons/fa";
import {
  pendingRequestCountAtom,
  totalUnreadAtom,
  unreadNotificationsAtom,
} from "@/lib/chat/atoms";
import { cn } from "@/lib/utils";

export function SidebarSocialNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const unread = useAtomValue(totalUnreadAtom);
  const pending = useAtomValue(pendingRequestCountAtom);
  const notif = useAtomValue(unreadNotificationsAtom);

  const items: {
    href: string;
    label: string;
    icon: IconType;
    badge: number;
  }[] = [
    { href: "/chat", label: "Chat", icon: FaComments, badge: unread },
    {
      href: "/friends",
      label: "Friends",
      icon: FaUserFriends,
      badge: pending,
    },
    {
      href: "/notifications",
      label: "Notifications",
      icon: FaBell,
      badge: notif,
    },
  ];

  return (
    <div className="mb-4">
      <div
        className={cn(
          "mb-1 overflow-hidden whitespace-nowrap px-2.5 py-1 font-medium text-sidebar-foreground/60 text-xs uppercase tracking-wider transition-[max-width,opacity]",
          collapsed ? "max-w-0 opacity-0" : "max-w-48 opacity-100",
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
                "relative mx-1 flex h-9 items-center gap-2.5 overflow-hidden rounded-lg text-sm transition",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                collapsed ? "justify-center px-0" : "px-2.5",
              )}
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
                  <span className="-right-1.5 -top-1.5 absolute size-2 rounded-full bg-primary" />
                ) : null}
              </span>
              {!collapsed ? (
                <span className="flex-1 truncate font-medium">{label}</span>
              ) : null}
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
