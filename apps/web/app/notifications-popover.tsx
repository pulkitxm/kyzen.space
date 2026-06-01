"use client";

import { CHAT_EVENTS, type NotificationJson } from "@gamelobby/chat-core";
import { useAtomValue, useStore } from "jotai";
import Link from "next/link";
import { useCallback } from "react";
import { FaBell } from "react-icons/fa";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { notificationsAtom, unreadNotificationsAtom } from "@/lib/chat/atoms";
import { relativeTime } from "@/lib/chat/format";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

function notifText(n: NotificationJson): string {
  const who = n.actor?.username ?? "Someone";
  switch (n.type) {
    case "friend_request":
      return `${who} sent you a friend request`;
    case "friend_accepted":
      return `${who} accepted your friend request`;
    case "game_started":
      return `${who} started a game — tap to join`;
    case "game_challenge":
      return `${who} challenged you to a game`;
    default:
      return "New notification";
  }
}

function notifHref(n: NotificationJson): string {
  if (n.type === "friend_request" || n.type === "friend_accepted") {
    return "/friends";
  }
  if (n.payload.gameId) return `/play/${n.payload.gameId}`;
  if (n.payload.conversationId) return `/chat/${n.payload.conversationId}`;
  return "/chat";
}

export function NotificationsPopover({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  // The list is seeded on the server and kept live by the socket bridge, so the
  // popover just reads the atoms — the ticker reflects how many are unread.
  const notifs = useAtomValue(notificationsAtom);
  const count = useAtomValue(unreadNotificationsAtom);
  const store = useStore();
  const { socket } = useSocket();

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) return;
      // Seeing the list counts as reading it: clear the unread state locally and
      // on the server the moment the popover opens.
      if (store.get(unreadNotificationsAtom) === 0) return;
      store.set(unreadNotificationsAtom, 0);
      store.set(notificationsAtom, (prev) =>
        prev.map((n) => ({ ...n, read: true })),
      );
      void emitAck(socket, CHAT_EVENTS.notificationReadAll, {}).catch(() => {});
    },
    [socket, store],
  );

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-9 w-full cursor-pointer items-center rounded-lg outline-none transition-[gap,padding,background-color] duration-250 ease-in-out hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar data-[state=open]:bg-sidebar-accent",
            "text-sidebar-foreground/70 hover:text-sidebar-foreground",
          )}
          style={{
            gap: collapsed ? 0 : 10,
            paddingLeft: collapsed ? 12 : 10,
            paddingRight: collapsed ? 12 : 10,
          }}
          aria-label="Notifications"
        >
          <span className="relative flex size-7 shrink-0 items-center justify-center">
            <FaBell className="size-4 shrink-0" aria-hidden />
            {count > 0 && collapsed ? (
              <span className="-right-0.5 -top-0.5 absolute flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[9px] text-primary-foreground leading-none">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left text-sidebar-foreground/90 text-sm transition-[opacity,max-width,filter] duration-250 ease-in-out",
              collapsed
                ? "max-w-0 opacity-0 blur-[2px]"
                : "max-w-48 opacity-100 blur-0",
            )}
          >
            Notifications
          </span>
          {!collapsed && count > 0 ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 font-semibold text-[10px] text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        alignOffset={-12}
        sideOffset={12}
        className="flex max-h-[70vh] w-[420px] max-w-[calc(100vw-2rem)] flex-col p-0"
      >
        <div className="flex items-center gap-2 border-border border-b px-4 py-3">
          <span className="font-semibold text-sm">Notifications</span>
          {count > 0 ? (
            <span className="rounded-full bg-surface-overlay px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground">
              {count}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {"You're all caught up."}
            </div>
          ) : (
            notifs.map((n) => (
              <Link
                key={n.id}
                href={notifHref(n)}
                onClick={onNavigate}
                className="flex items-center gap-3 border-border/60 border-b px-4 py-3 transition last:border-b-0 hover:bg-surface-overlay"
              >
                <PresenceAvatar
                  config={n.actor?.avatar ?? null}
                  seed={n.actor?.username ?? "?"}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{notifText(n)}</div>
                  <div className="text-muted-foreground text-xs">
                    {relativeTime(n.createdAt)}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
