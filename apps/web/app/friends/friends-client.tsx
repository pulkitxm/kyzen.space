"use client";

import {
  ANON_FRIEND_LIMIT_MESSAGE,
  CHAT_EVENTS,
} from "@gamelobby/shared/constants";
import type { FriendshipJson, SearchUserJson } from "@gamelobby/shared/types";
import { useAtomValue, useStore } from "jotai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { PresenceAvatar } from "@/components/ui/avatar-stack";
import { ProfilePopupTrigger } from "@/components/ui/profile-popup";
import { clientFetchJson } from "@/lib/api-client";
import {
  friendsAtom,
  incomingRequestsAtom,
  outgoingRequestsAtom,
  presenceAtom,
  upsertFriend,
} from "@/lib/chat/atoms";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";

type Tab = "friends" | "requests" | "add";

export function FriendsClient() {
  const [tab, setTab] = useState<Tab>("friends");
  const friends = useAtomValue(friendsAtom);
  const incoming = useAtomValue(incomingRequestsAtom);
  const outgoing = useAtomValue(outgoingRequestsAtom);
  const presence = useAtomValue(presenceAtom);
  const store = useStore();
  const { socket } = useSocket();
  const router = useRouter();

  const startDm = useCallback(
    (username: string) => {
      router.push(`/chat/${username}`);
    },
    [router],
  );

  const respond = useCallback(
    async (requestId: string, action: "accept" | "decline") => {
      store.set(incomingRequestsAtom, (prev) =>
        prev.filter((f) => f.id !== requestId),
      );
      try {
        const res = await emitAck<{ friendship?: FriendshipJson | null }>(
          socket,
          CHAT_EVENTS.friendRespond,
          { requestId, action },
        );
        if (action === "accept" && res.friendship) {
          const accepted = res.friendship;
          store.set(friendsAtom, (prev) => upsertFriend(prev, accepted));
        }
      } catch {}
    },
    [socket, store],
  );

  const removeFriend = useCallback(
    async (otherId: string) => {
      store.set(friendsAtom, (prev) =>
        prev.filter((f) => f.user.id !== otherId),
      );
      try {
        await emitAck(socket, CHAT_EVENTS.friendRemove, { userId: otherId });
      } catch {}
    },
    [socket, store],
  );

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "friends", label: "Friends", count: friends.length },
    { id: "requests", label: "Requests", count: incoming.length },
    { id: "add", label: "Add" },
  ];

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <header className="border-border border-b px-4 pt-4">
        <h1 className="mb-3 font-semibold text-lg">Friends</h1>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-t-lg px-3 py-2 font-medium text-sm transition",
                tab === t.id
                  ? "border-primary border-b-2 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.count ? (
                <span className="ml-1.5 rounded-full bg-surface-overlay px-1.5 text-xs">
                  {t.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "friends" ? (
          friends.length === 0 ? (
            <Empty>No friends yet. Use the Add tab to find people.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {friends.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-overlay"
                >
                  <ProfilePopupTrigger user={f.user} className="shrink-0">
                    <PresenceAvatar
                      config={f.user.avatar}
                      seed={f.user.username}
                      size={40}
                      online={
                        presence.get(f.user.id)?.online ? true : undefined
                      }
                    />
                  </ProfilePopupTrigger>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-sm">
                      {f.user.displayName ?? f.user.username}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      @{f.user.username}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => startDm(f.user.username)}>
                    Message
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFriend(f.user.id)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "requests" ? (
          <div className="flex flex-col gap-5">
            <Section title="Incoming">
              {incoming.length === 0 ? (
                <Empty>No incoming requests.</Empty>
              ) : (
                incoming.map((f) => (
                  <Row key={f.id} user={f.user}>
                    <Button size="sm" onClick={() => respond(f.id, "accept")}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => respond(f.id, "decline")}
                    >
                      Decline
                    </Button>
                  </Row>
                ))
              )}
            </Section>
            <Section title="Sent">
              {outgoing.length === 0 ? (
                <Empty>No pending sent requests.</Empty>
              ) : (
                outgoing.map((f) => (
                  <Row key={f.id} user={f.user}>
                    <span className="text-muted-foreground text-xs">
                      Pending
                    </span>
                  </Row>
                ))
              )}
            </Section>
          </div>
        ) : null}

        {tab === "add" ? <AddFriend /> : null}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h2>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Row({
  user,
  children,
}: {
  user:
    | SearchUserJson
    | {
        username: string;
        displayName: string | null;
        avatar: SearchUserJson["avatar"];
      };
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-overlay">
      <ProfilePopupTrigger user={user} className="shrink-0">
        <PresenceAvatar config={user.avatar} seed={user.username} size={40} />
      </ProfilePopupTrigger>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">
          {user.displayName ?? user.username}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          @{user.username}
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-8 text-center text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function AddFriend() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchUserJson[]>([]);
  const [loading, setLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const { socket } = useSocket();

  useEffect(() => {
    const value = q.trim();
    if (!value) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await clientFetchJson<{ users: SearchUserJson[] }>(
          `/api/friends/search?q=${encodeURIComponent(value)}`,
        );
        setResults(res.users);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const add = useCallback(
    async (user: SearchUserJson) => {
      setResults((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, friendState: "outgoing" } : u,
        ),
      );
      try {
        await emitAck(socket, CHAT_EVENTS.friendRequest, {
          username: user.username,
        });
      } catch (err) {
        setResults((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, friendState: "none" } : u,
          ),
        );
        if (err instanceof Error && err.message === ANON_FRIEND_LIMIT_MESSAGE) {
          setLimitReached(true);
        }
      }
    },
    [socket],
  );

  return (
    <div className="flex flex-col gap-3">
      {limitReached ? (
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm">
          {ANON_FRIEND_LIMIT_MESSAGE}{" "}
          <Link href="/auth" className="font-medium text-primary underline">
            Log in
          </Link>{" "}
          to add more.
        </div>
      ) : null}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username…"
        aria-label="Search by username"
        className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {loading ? (
        <Empty>Searching…</Empty>
      ) : results.length === 0 ? (
        q.trim() ? (
          <Empty>No users found.</Empty>
        ) : null
      ) : (
        <ul className="flex flex-col gap-1">
          {results.map((u) => (
            <Row key={u.id} user={u}>
              {u.friendState === "friends" ? (
                <span className="text-muted-foreground text-xs">Friends</span>
              ) : u.friendState === "outgoing" ? (
                <span className="text-muted-foreground text-xs">Requested</span>
              ) : u.friendState === "incoming" ? (
                <span className="text-muted-foreground text-xs">
                  Wants to add you
                </span>
              ) : (
                <Button size="sm" onClick={() => add(u)}>
                  Add
                </Button>
              )}
            </Row>
          ))}
        </ul>
      )}
    </div>
  );
}
