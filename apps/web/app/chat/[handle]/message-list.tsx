"use client";

import type {
  GameCardMeta,
  MemberJson,
  MessageJson,
} from "@gamelobby/shared/types";
import { useStore } from "jotai";
import { useCallback, useRef, useState } from "react";
import { FaArrowDown } from "react-icons/fa6";
import { clientFetchJson } from "@/lib/api-client";
import { type ChatMessage, messagesAtomFamily } from "@/lib/chat/atoms";
import { MessageBubble } from "./message-bubble";

const PAGE_SIZE = 20;
const LOAD_OLDER_AT = 200;
const SHOW_JUMP_AT = 280;

export function MessageList({
  conversationId,
  messages,
  userId,
  members,
  initialNextCursor,
}: {
  conversationId: string;
  messages: ChatMessage[];
  userId: string;
  members: MemberJson[];
  initialNextCursor: string | null;
}) {
  const store = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(initialNextCursor);
  const loadingRef = useRef(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJump, setShowJump] = useState(false);

  const nameOf = (id: string | null | undefined) =>
    members.find((m) => m.id === id)?.username ?? "Someone";

  const visibleMessages = messages.filter(
    (m) =>
      !(
        m.kind === "game_card" &&
        (m.metadata as GameCardMeta | null)?.seriesSuperseded
      ),
  );

  const rows = visibleMessages.map((m, i) => {
    const prev = visibleMessages[i - 1];
    return {
      m,
      showAvatar: m.sender?.id !== prev?.sender?.id || m.kind === "system",
    };
  });

  const loadOlder = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      const res = await clientFetchJson<{
        messages: MessageJson[];
        nextCursor: string | null;
      }>(
        `/api/conversations/${conversationId}/messages?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(
          cursorRef.current,
        )}`,
      );
      cursorRef.current = res.nextCursor;
      const older = [...res.messages].reverse();
      if (older.length) {
        store.set(messagesAtomFamily(conversationId), (prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !seen.has(m.id));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      }
    } catch {
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, store]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const fromBottom = Math.abs(el.scrollTop);
    const fromTop = el.scrollHeight - el.clientHeight - fromBottom;
    setShowJump(fromBottom > SHOW_JUMP_AT);
    if (fromTop < LOAD_OLDER_AT && el.scrollHeight > el.clientHeight) {
      void loadOlder();
    }
  }, [loadOlder]);

  const jumpToBottom = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {loadingOlder ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
          <span className="rounded-full bg-surface-overlay px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
            Loading earlier messages…
          </span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col-reverse gap-0.5 overflow-y-auto overflow-x-hidden px-4 py-4 md:px-6"
      >
        {rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No messages yet. Say hi 👋
          </div>
        ) : (
          [...rows]
            .reverse()
            .map(({ m, showAvatar }) => (
              <MessageBubble
                key={m.id}
                message={m}
                userId={userId}
                showAvatar={showAvatar}
                nameOf={nameOf}
              />
            ))
        )}
      </div>
      {showJump ? (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Scroll to latest"
          className="absolute right-4 bottom-4 flex size-10 items-center justify-center rounded-full border border-border bg-surface-raised text-foreground shadow-md outline-none transition hover:bg-surface-overlay"
        >
          <FaArrowDown className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
