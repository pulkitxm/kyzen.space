"use client";

import { CHAT_EVENTS, type MemberJson } from "@gamelobby/chat-core";
import { useStore } from "jotai";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaRegSmile } from "react-icons/fa";
import {
  type ChatMessage,
  messagesAtomFamily,
  upsertMessage,
} from "@/lib/chat/atoms";
import { loadShortcodes } from "@/lib/chat/emoji";
import { replaceShortcodeBeforeSpace } from "@/lib/chat/shortcodes";
import { emitAck, useSocket } from "@/lib/socket/socket-context";

const EmojiPicker = dynamic(
  () => import("./emoji-picker").then((m) => m.EmojiPicker),
  { ssr: false },
);

export function MessageComposer({
  conversationId,
  me,
}: {
  conversationId: string;
  me: MemberJson | undefined;
}) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const store = useStore();
  const { socket } = useSocket();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const shortcodesRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    void loadShortcodes().then((m) => {
      shortcodesRef.current = m;
    });
  }, []);

  const lastTypingRef = useRef(0);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTyping = useCallback(() => {
    if (idleRef.current) {
      clearTimeout(idleRef.current);
      idleRef.current = null;
    }
    lastTypingRef.current = 0;
    socket?.emit(CHAT_EVENTS.typingStop, { conversationId });
  }, [socket, conversationId]);

  const emitTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingRef.current > 2000) {
      lastTypingRef.current = now;
      socket?.emit(CHAT_EVENTS.typingStart, { conversationId });
    }
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      idleRef.current = null;
      lastTypingRef.current = 0;
      socket?.emit(CHAT_EVENTS.typingStop, { conversationId });
    }, 3000);
  }, [socket, conversationId]);

  // Stop typing when leaving the conversation / unmounting.
  useEffect(() => stopTyping, [stopTyping]);

  const onType = useCallback(
    (value: string, caret: number) => {
      // WhatsApp-style `:code ` -> emoji replacement.
      if (shortcodesRef.current && value[caret - 1] === " ") {
        const replaced = replaceShortcodeBeforeSpace(value, caret, (c) =>
          shortcodesRef.current?.get(c),
        );
        if (replaced) {
          setText(replaced.value);
          requestAnimationFrame(() =>
            taRef.current?.setSelectionRange(replaced.caret, replaced.caret),
          );
          emitTyping();
          return;
        }
      }
      setText(value);
      if (value.trim()) emitTyping();
      else stopTyping();
    },
    [emitTyping, stopTyping],
  );

  const insertEmoji = useCallback(
    (native: string) => {
      const ta = taRef.current;
      const start = ta?.selectionStart ?? text.length;
      const end = ta?.selectionEnd ?? start;
      const next = text.slice(0, start) + native + text.slice(end);
      setText(next);
      setPickerOpen(false);
      requestAnimationFrame(() => {
        ta?.focus();
        const pos = start + native.length;
        ta?.setSelectionRange(pos, pos);
      });
    },
    [text],
  );

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
    stopTyping();
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
  }, [text, conversationId, me, socket, store, stopTyping]);

  return (
    <div className="relative border-border border-t px-4 py-3">
      {pickerOpen ? (
        <>
          <button
            type="button"
            aria-label="Close emoji picker"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setPickerOpen(false)}
          />
          <div className="absolute bottom-full left-3 z-20 mb-2">
            <EmojiPicker onSelect={insertEmoji} />
          </div>
        </>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-label="Emoji"
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition hover:bg-surface-overlay hover:text-foreground"
        >
          <FaRegSmile className="size-5" />
        </button>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) =>
            onType(
              e.target.value,
              e.target.selectionStart ?? e.target.value.length,
            )
          }
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
    </div>
  );
}
