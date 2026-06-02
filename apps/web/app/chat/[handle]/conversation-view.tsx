"use client";

import {
  CHAT_EVENTS,
  type ConversationJson,
  type MessageJson,
} from "@gamelobby/chat-core";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { AvatarStack, PresenceAvatar } from "@/components/ui/avatar-stack";
import {
  activeConversationIdAtom,
  conversationsAtom,
  messagesAtomFamily,
  presenceAtom,
  upsertConversation,
} from "@/lib/chat/atoms";
import { onlineCount, presenceLabel } from "@/lib/chat/presence";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { GroupSettingsDialog } from "./group-settings-dialog";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import { TypingIndicator } from "./typing-indicator";

export function ConversationView({
  userId,
  initialConversation,
  initialMessages,
  initialNextCursor,
}: {
  userId: string;
  initialConversation: ConversationJson;
  initialMessages: MessageJson[];
  initialNextCursor: string | null;
}) {
  const store = useStore();
  const conversationId = initialConversation.id;
  const setActive = useSetAtom(activeConversationIdAtom);
  const { socket } = useSocket();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const initialReversed = useMemo(
    () => [...initialMessages].reverse(),
    [initialMessages],
  );
  useHydrateAtoms(
    new Map([[messagesAtomFamily(conversationId), initialReversed]]),
  );
  const messages = useAtomValue(messagesAtomFamily(conversationId));

  const liveConv = useAtomValue(conversationsAtom).find(
    (c) => c.id === conversationId,
  );
  const conversation = liveConv ?? initialConversation;

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

  const presence = useAtomValue(presenceAtom);
  const me = conversation.members.find((m) => m.id === userId);
  const others = conversation.members.filter((m) => m.id !== userId);
  const isGroup = conversation.kind === "group";
  const otherPresence = others[0] ? presence.get(others[0].id) : undefined;
  const title = isGroup
    ? (conversation.name ?? "Group")
    : (others[0]?.username ?? "Direct message");
  const subtitle = isGroup
    ? `${onlineCount(
        presence,
        conversation.members.map((m) => m.id),
        userId,
      )} online · ${conversation.members.length} members · tap to manage`
    : presenceLabel(otherPresence);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
      <header className="flex items-center gap-3 border-border border-b px-4 py-3">
        <Link
          href="/chat"
          className="text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Back to conversations"
        >
          <FaArrowLeft className="size-4" />
        </Link>
        {isGroup ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <AvatarStack
              users={others.map((m) => ({
                id: m.id,
                avatar: m.avatar,
                seed: m.username,
              }))}
              size={32}
            />
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{title}</div>
              <div className="truncate text-muted-foreground text-xs">
                {subtitle}
              </div>
            </div>
          </button>
        ) : (
          <>
            <PresenceAvatar
              config={others[0]?.avatar ?? null}
              seed={others[0]?.username ?? "?"}
              size={36}
              online={otherPresence?.online ? true : undefined}
            />
            <div className="min-w-0">
              <div className="truncate font-medium text-sm">{title}</div>
              <div
                className={
                  otherPresence?.online
                    ? "truncate text-emerald-500 text-xs"
                    : "truncate text-muted-foreground text-xs"
                }
              >
                {subtitle}
              </div>
            </div>
          </>
        )}
      </header>

      <MessageList
        conversationId={conversationId}
        messages={messages}
        userId={userId}
        members={conversation.members}
        initialNextCursor={initialNextCursor}
      />
      <TypingIndicator conversationId={conversationId} userId={userId} />
      <MessageComposer
        conversationId={conversationId}
        conversation={conversation}
        me={me}
      />

      {isGroup ? (
        <GroupSettingsDialog
          conversation={conversation}
          userId={userId}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  );
}
