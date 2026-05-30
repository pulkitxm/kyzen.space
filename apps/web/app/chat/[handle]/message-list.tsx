"use client";

import type { MemberJson, MessageJson } from "@gamelobby/chat-core";
import { useStore } from "jotai";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { FaArrowDown } from "react-icons/fa";
import { clientFetchJson } from "@/lib/api-client";
import { type ChatMessage, messagesAtomFamily } from "@/lib/chat/atoms";
import { MessageBubble } from "./message-bubble";

const PAGE_SIZE = 20;
const LOAD_OLDER_AT = 160; // px from top
const SHOW_JUMP_AT = 280; // px from bottom

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
  const didInitRef = useRef(false);
  // When set, the next layout pass restored scroll after prepending older
  // messages — holds the scrollHeight measured just before the prepend.
  const restoreFromRef = useRef<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showJump, setShowJump] = useState(false);

  const nameOf = (id: string | null | undefined) =>
    members.find((m) => m.id === id)?.username ?? "Someone";

  // Pin the viewport correctly: jump to bottom on first paint (instant, no
  // smooth-scroll cost even with many messages), keep it stable when older
  // messages are prepended, and follow new messages only when near the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react to message changes
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!didInitRef.current) {
      didInitRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (restoreFromRef.current != null) {
      el.scrollTop += el.scrollHeight - restoreFromRef.current;
      restoreFromRef.current = null;
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      const older = [...res.messages].reverse(); // newest-first -> chronological
      const el = containerRef.current;
      if (older.length && el) {
        restoreFromRef.current = el.scrollHeight;
        store.set(messagesAtomFamily(conversationId), (prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !seen.has(m.id));
          return fresh.length ? [...fresh, ...prev] : prev;
        });
      }
    } catch {
      // Leave the cursor in place so a later scroll retries.
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, store]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setShowJump(
      el.scrollHeight - el.scrollTop - el.clientHeight > SHOW_JUMP_AT,
    );
    if (el.scrollTop < LOAD_OLDER_AT && el.scrollHeight > el.clientHeight) {
      void loadOlder();
    }
  }, [loadOlder]);

  const jumpToBottom = () => {
    const el = containerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 py-4 md:px-6"
      >
        {messages.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const showAvatar =
              m.sender?.id !== prev?.sender?.id || m.kind === "system";
            return (
              <MessageBubble
                key={m.id}
                message={m}
                userId={userId}
                showAvatar={showAvatar}
                nameOf={nameOf}
              />
            );
          })
        )}
      </div>
      {showJump ? (
        <button
          type="button"
          onClick={jumpToBottom}
          aria-label="Scroll to latest"
          className="absolute right-4 bottom-4 flex size-10 items-center justify-center rounded-full border border-border bg-surface-raised text-foreground shadow-md transition hover:bg-surface-overlay"
        >
          <FaArrowDown className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
