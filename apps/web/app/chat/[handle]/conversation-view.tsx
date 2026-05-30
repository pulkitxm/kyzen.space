"use client";

import {
  CHAT_EVENTS,
  type ConversationJson,
  type MessageJson,
} from "@gamelobby/chat-core";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { AvatarStack, PresenceAvatar } from "@/components/ui/avatar-stack";
import {
  activeConversationIdAtom,
  conversationsAtom,
  messagesAtomFamily,
  upsertConversation,
} from "@/lib/chat/atoms";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";

export function ConversationView({
  userId,
  initialConversation,
  initialMessages,
}: {
  userId: string;
  initialConversation: ConversationJson;
  initialMessages: MessageJson[];
}) {
  const store = useStore();
  const conversationId = initialConversation.id;
  const setActive = useSetAtom(activeConversationIdAtom);
  const { socket } = useSocket();

  // Hydrate server-fetched history (newest-first -> chronological) synchronously,
  // before first paint, so there's no empty-state flicker.
  const initialReversed = useMemo(
    () => [...initialMessages].reverse(),
    [initialMessages],
  );
  useHydrateAtoms(
    new Map([[messagesAtomFamily(conversationId), initialReversed]]),
  );
  const messages = useAtomValue(messagesAtomFamily(conversationId));

  // Ensure this conversation is present in the inbox list (e.g. on deep-link).
  useEffect(() => {
    store.set(conversationsAtom, (prev) =>
      prev.some((c) => c.id === conversationId)
        ? prev
        : upsertConversation(prev, initialConversation),
    );
  }, [conversationId, initialConversation, store]);

  useEffect(() => {
    setActive(conversationId);
    return () => setActive(null);
  }, [conversationId, setActive]);

  // Mark read whenever the latest delivered message changes.
  const last = messages[messages.length - 1];
  const lastId = last && !last.pending ? last.id : null;
  useEffect(() => {
    if (!lastId) return;
    void emitAck(socket, CHAT_EVENTS.markRead, {
      conversationId,
      messageId: lastId,
    }).catch(() => {});
    store.set(conversationsAtom, (prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
  }, [lastId, conversationId, socket, store]);

  const me = initialConversation.members.find((m) => m.id === userId);
  const others = initialConversation.members.filter((m) => m.id !== userId);
  const title =
    initialConversation.kind === "group"
      ? (initialConversation.name ?? "Group")
      : (others[0]?.username ?? "Direct message");
  const subtitle =
    initialConversation.kind === "group"
      ? `${initialConversation.members.length} members`
      : `@${others[0]?.username ?? ""}`;

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <header className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Link
          href="/chat"
          className="text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Back to conversations"
        >
          <FaArrowLeft className="size-4" />
        </Link>
        {initialConversation.kind === "group" ? (
          <AvatarStack
            users={others.map((m) => ({
              id: m.id,
              avatar: m.avatar,
              seed: m.username,
            }))}
            size={32}
          />
        ) : (
          <PresenceAvatar
            config={others[0]?.avatar ?? null}
            seed={others[0]?.username ?? "?"}
            size={36}
          />
        )}
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{title}</div>
          <div className="truncate text-muted-foreground text-xs">
            {subtitle}
          </div>
        </div>
      </header>

      <MessageList
        messages={messages}
        userId={userId}
        members={initialConversation.members}
      />
      <MessageComposer conversationId={conversationId} me={me} />
    </div>
  );
}
