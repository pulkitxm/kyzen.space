"use client";

import type { MemberJson } from "@gamelobby/chat-core";
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/chat/atoms";
import { MessageBubble } from "./message-bubble";

export function MessageList({
  messages,
  userId,
  members,
}: {
  messages: ChatMessage[];
  userId: string;
  members: MemberJson[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const nameOf = (id: string | null | undefined) =>
    members.find((m) => m.id === id)?.username ?? "Someone";

  // Autoscroll on new message when already near the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on count change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Jump to bottom on first mount.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, []);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
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
      <div ref={bottomRef} />
    </div>
  );
}
