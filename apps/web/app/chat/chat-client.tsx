"use client";

import { useAtomValue } from "jotai";
import Link from "next/link";
import { useState } from "react";
import { FaUserFriends, FaUsers } from "react-icons/fa";
import { AvatarStack, PresenceAvatar } from "@/components/ui/avatar-stack";
import { conversationsAtom, presenceAtom } from "@/lib/chat/atoms";
import { messagePreview, relativeTime } from "@/lib/chat/format";
import { NewGroupDialog } from "./new-group-dialog";

export function ChatListClient({ userId }: { userId: string }) {
  const conversations = useAtomValue(conversationsAtom);
  const presence = useAtomValue(presenceAtom);
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3.5">
        <h1 className="font-semibold text-lg">Messages</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setGroupOpen(true)}
            className="flex items-center gap-1.5 text-primary text-sm hover:underline"
          >
            <FaUsers className="size-4" /> New group
          </button>
          <Link
            href="/friends"
            className="flex items-center gap-1.5 text-primary text-sm hover:underline"
          >
            <FaUserFriends className="size-4" /> Friends
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">
            No conversations yet.{" "}
            <Link href="/friends" className="text-primary hover:underline">
              Find friends
            </Link>{" "}
            to start chatting.
          </div>
        ) : (
          conversations.map((c) => {
            const others = c.members.filter((m) => m.id !== userId);
            const title =
              c.kind === "group"
                ? (c.name ?? "Group")
                : (c.name ?? others[0]?.username ?? "Direct message");
            const href =
              c.kind === "dm" && others[0]
                ? `/chat/${others[0].username}`
                : `/chat/${c.id}`;
            return (
              <Link
                key={c.id}
                href={href}
                className="flex items-center gap-3 border-border/60 border-b px-4 py-3 transition hover:bg-surface-overlay"
              >
                {c.kind === "group" ? (
                  <AvatarStack
                    users={others.map((m) => ({
                      id: m.id,
                      avatar: m.avatar,
                      seed: m.username,
                    }))}
                    size={40}
                  />
                ) : (
                  <PresenceAvatar
                    config={others[0]?.avatar ?? null}
                    seed={others[0]?.username ?? "?"}
                    size={44}
                    online={
                      others[0] && presence.get(others[0].id)?.online
                        ? true
                        : undefined
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-sm">
                      {title}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {relativeTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-muted-foreground text-xs">
                      {messagePreview(c.lastMessage)}
                    </span>
                    {c.unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 font-semibold text-[10px] text-primary-foreground">
                        {c.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>

      <NewGroupDialog open={groupOpen} onClose={() => setGroupOpen(false)} />
    </div>
  );
}
