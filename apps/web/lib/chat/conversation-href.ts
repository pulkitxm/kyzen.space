import type { ConversationJson } from "@kyzen/shared/types";

export function conversationHref(
  conversation: Pick<ConversationJson, "id" | "kind" | "name" | "members">,
  userId: string,
): string {
  if (conversation.kind === "group" && conversation.name) {
    return `/chat/group/${encodeURIComponent(conversation.name)}`;
  }
  const other = conversation.members.find((m) => m.id !== userId);
  if (other) return `/chat/${other.username}`;
  return `/chat/${conversation.id}`;
}
