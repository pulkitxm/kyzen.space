"use client";

import { CHAT_EVENTS, type NotificationJson } from "@gamelobby/chat-core";
import { useAtom, useStore } from "jotai";
import Link from "next/link";
import { useEffect } from "react";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { clientFetchJson } from "@/lib/api-client";
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

export function NotificationsClient() {
  const [notifs, setNotifs] = useAtom(notificationsAtom);
  const store = useStore();
  const { socket } = useSocket();

  useEffect(() => {
    void (async () => {
      try {
        const res = await clientFetchJson<{
          notifications: NotificationJson[];
        }>("/api/notifications?limit=50");
        setNotifs(res.notifications);
      } catch {}
    })();
  }, [setNotifs]);

  const markAll = async () => {
    store.set(unreadNotificationsAtom, 0);
    store.set(notificationsAtom, (prev) =>
      prev.map((n) => ({ ...n, read: true })),
    );
    try {
      await emitAck(socket, CHAT_EVENTS.notificationReadAll, {});
    } catch {}
  };

  const open = async (n: NotificationJson) => {
    if (!n.read) {
      store.set(notificationsAtom, (prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
      );
      store.set(unreadNotificationsAtom, (c) => Math.max(0, c - 1));
      try {
        await emitAck(socket, CHAT_EVENTS.notificationRead, { id: n.id });
      } catch {}
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between border-border border-b px-4 py-3.5">
        <h1 className="font-semibold text-lg">Notifications</h1>
        <button
          type="button"
          onClick={() => void markAll()}
          className="text-primary text-sm hover:underline"
        >
          Mark all read
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notifs.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            You're all caught up.
          </div>
        ) : (
          notifs.map((n) => (
            <Link
              key={n.id}
              href={notifHref(n)}
              onClick={() => void open(n)}
              className={cn(
                "flex items-center gap-3 border-border/60 border-b px-4 py-3 transition hover:bg-surface-overlay",
                !n.read && "bg-primary/5",
              )}
            >
              <PresenceAvatar
                config={n.actor?.avatar ?? null}
                seed={n.actor?.username ?? "?"}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{notifText(n)}</div>
                <div className="text-muted-foreground text-xs">
                  {relativeTime(n.createdAt)}
                </div>
              </div>
              {!n.read ? (
                <span className="size-2 shrink-0 rounded-full bg-primary" />
              ) : null}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
