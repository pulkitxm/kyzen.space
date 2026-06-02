"use client";

import { CHAT_EVENTS, type ConversationJson } from "@gamelobby/chat-core";
import type { GameType } from "@gamelobby/games-core";
import { useAtomValue } from "jotai";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarStack, PresenceAvatar } from "@/components/ui/avatar-stack";
import { conversationsAtom, friendsAtom } from "@/lib/chat/atoms";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

const ROW =
  "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none transition hover:bg-surface-overlay disabled:opacity-50";

export function ConversationPicker({
  userId,
  gameType,
  config,
  onClose,
}: {
  userId: string;
  gameType: GameType;
  config?: unknown;
  onClose: () => void;
}) {
  const conversations = useAtomValue(conversationsAtom);
  const friends = useAtomValue(friendsAtom);
  const { socket } = useSocket();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState<ConversationJson | null>(null);

  const launch = async (
    conversationId: string,
    seatingMode: "open" | "challenge",
    challengedUserId?: string,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await emitAck<{ game: { id: string } }>(
        socket,
        CHAT_EVENTS.createGameInConversation,
        { conversationId, gameType, seatingMode, challengedUserId, config },
      );
      onClose();
      router.push(`/play/${res.game.id}`);
    } catch {
      setBusy(false);
    }
  };

  const pickFriend = async (friendUserId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const dm = await emitAck<{ conversation: { id: string } }>(
        socket,
        CHAT_EVENTS.createDm,
        { userId: friendUserId },
      );
      const res = await emitAck<{ game: { id: string } }>(
        socket,
        CHAT_EVENTS.createGameInConversation,
        {
          conversationId: dm.conversation.id,
          gameType,
          seatingMode: "open",
          config,
        },
      );
      onClose();
      router.push(`/play/${res.game.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-border bg-card p-4 shadow-xl">
        {group ? (
          <>
            <button
              type="button"
              onClick={() => setGroup(null)}
              className="mb-2 self-start text-muted-foreground text-xs outline-none hover:text-foreground"
            >
              ← Back
            </button>
            <h2 className="mb-3 truncate font-semibold text-lg">
              Start in {group.name ?? "group"}
            </h2>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              <button
                type="button"
                disabled={busy}
                onClick={() => void launch(group.id, "open")}
                className={ROW}
              >
                Open game · anyone can join
              </button>
              {group.members
                .filter((m) => m.id !== userId)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void launch(group.id, "challenge", m.id)}
                    className={ROW}
                  >
                    <PresenceAvatar
                      config={m.avatar}
                      seed={m.username}
                      size={28}
                    />
                    <span className="truncate">
                      Challenge {m.displayName ?? m.username}
                    </span>
                  </button>
                ))}
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-3 font-semibold text-lg">Play with…</h2>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {conversations.length === 0 && friends.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Add friends to start playing.
                </div>
              ) : null}
              {conversations.map((c) => {
                const others = c.members.filter((m) => m.id !== userId);
                const isGroup = c.kind === "group";
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      isGroup ? setGroup(c) : void launch(c.id, "open")
                    }
                    className={ROW}
                  >
                    {isGroup ? (
                      <AvatarStack
                        users={others.map((m) => ({
                          id: m.id,
                          avatar: m.avatar,
                          seed: m.username,
                        }))}
                        size={28}
                      />
                    ) : (
                      <PresenceAvatar
                        config={others[0]?.avatar ?? null}
                        seed={others[0]?.username ?? "?"}
                        size={28}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {c.name ?? others[0]?.username ?? "Conversation"}
                    </span>
                    {isGroup ? (
                      <span className="text-muted-foreground text-xs">
                        group
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {friends.length ? (
                <div className="px-2 pt-3 pb-1 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                  Start a new chat
                </div>
              ) : null}
              {friends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void pickFriend(f.user.id)}
                  className={ROW}
                >
                  <PresenceAvatar
                    config={f.user.avatar}
                    seed={f.user.username}
                    size={28}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {f.user.displayName ?? f.user.username}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
