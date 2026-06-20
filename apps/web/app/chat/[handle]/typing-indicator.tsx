"use client";

import { useAtomValue } from "jotai";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { typingAtomFamily } from "@/lib/chat/atoms";

const TYPING_DOT_KEYFRAMES =
  "@keyframes typing-dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-40%)}}";

function Dots() {
  return (
    <span className="inline-flex items-end gap-0.5">
      <style>{TYPING_DOT_KEYFRAMES}</style>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 rounded-full bg-muted-foreground"
          style={{
            animation: "typing-dot 1s cubic-bezier(0.16, 1, 0.3, 1) infinite",
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </span>
  );
}

export function TypingIndicator({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) {
  const typers = useAtomValue(typingAtomFamily(conversationId)).filter(
    (t) => t.userId !== userId,
  );
  if (typers.length === 0) return null;

  const [first, second] = typers;
  const label =
    typers.length === 1 && first
      ? `${first.username} is typing`
      : typers.length === 2 && first && second
        ? `${first.username} and ${second.username} are typing`
        : `${typers.length} people are typing`;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-muted-foreground text-xs">
      <AvatarStack
        users={typers.map((t) => ({
          id: t.userId,
          avatar: t.avatar,
          seed: t.username,
        }))}
        size={20}
      />
      <span className="truncate">{label}</span>
      <Dots />
    </div>
  );
}
