"use client";

import { useAtomValue } from "jotai";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { typingAtomFamily } from "@/lib/chat/atoms";

function Dots() {
  return (
    <span className="inline-flex items-end gap-0.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
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

  const label =
    typers.length === 1
      ? `${typers[0]!.username} is typing`
      : typers.length === 2
        ? `${typers[0]!.username} and ${typers[1]!.username} are typing`
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
