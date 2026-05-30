"use client";

import { CHAT_EVENTS, type MemberJson } from "@gamelobby/chat-core";
import { useStore } from "jotai";
import { useCallback, useState } from "react";
import {
  type ChatMessage,
  messagesAtomFamily,
  upsertMessage,
} from "@/lib/chat/atoms";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

export function MessageComposer({
  conversationId,
  me,
}: {
  conversationId: string;
  me: MemberJson | undefined;
}) {
  const [text, setText] = useState("");
  const store = useStore();
  const { socket } = useSocket();

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    const clientId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: clientId,
      conversationId,
      sender: me
        ? {
            id: me.id,
            username: me.username,
            displayName: me.displayName,
            avatar: me.avatar,
          }
        : null,
      kind: "text",
      body,
      metadata: null,
      gameId: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      pending: true,
      clientId,
    };
    store.set(messagesAtomFamily(conversationId), (prev) =>
      upsertMessage(prev, optimistic),
    );
    setText("");
    try {
      await emitAck(socket, CHAT_EVENTS.sendMessage, {
        conversationId,
        clientId,
        kind: "text",
        body,
      });
    } catch {
      store.set(messagesAtomFamily(conversationId), (prev) =>
        prev.map((m) =>
          m.clientId === clientId ? { ...m, pending: false } : m,
        ),
      );
    }
  }, [text, conversationId, me, socket, store]);

  return (
    <div className="flex items-end gap-2 border-border border-t px-4 py-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        rows={1}
        placeholder="Message…"
        className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={!text.trim()}
        className="h-10 shrink-0 rounded-2xl bg-primary px-4 font-medium text-primary-foreground text-sm transition hover:bg-primary-hover disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}
