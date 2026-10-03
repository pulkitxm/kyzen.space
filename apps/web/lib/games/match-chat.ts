import {
  type GameJson,
  type GamePlayerDto,
  isBotId,
  type MatchMessage,
} from "@kyzen/shared/types";

export type ChatPanelMode = "conversation" | "match" | "none";

export function chatPanelMode(
  game: Pick<GameJson, "conversationId" | "players">,
  hasConversation: boolean,
  viewerId: string,
): ChatPanelMode {
  if (hasConversation) return "conversation";
  if (game.conversationId) return "none";
  return game.players.some((player) => player.userId === viewerId)
    ? "match"
    : "none";
}

export function chatPeers(
  game: Pick<GameJson, "players">,
  viewerId: string,
): GamePlayerDto[] {
  return game.players.filter(
    (player) => player.userId !== viewerId && !isBotId(player.userId),
  );
}

export function mergeMatchMessages(
  previous: MatchMessage[],
  incoming: MatchMessage[],
): MatchMessage[] {
  const messages = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()]
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .slice(-100);
}

export function isIncomingMatchMessage(
  known: MatchMessage[],
  message: MatchMessage,
  viewerId: string,
): boolean {
  return (
    message.authorId !== viewerId &&
    !known.some((entry) => entry.id === message.id)
  );
}

export type FriendState = {
  chosen: boolean;
  mutual: boolean;
  peerUsername: string | null;
};

export type MatchChatSnapshot = {
  messages: MatchMessage[];
  choices: string[];
  friends: { playerId: string; username: string }[];
};

export function friendStates(
  snapshot: Pick<MatchChatSnapshot, "choices" | "friends">,
): Record<string, FriendState> {
  const states: Record<string, FriendState> = {};
  for (const playerId of snapshot.choices)
    states[playerId] = { chosen: true, mutual: false, peerUsername: null };
  for (const friend of snapshot.friends)
    states[friend.playerId] = {
      chosen: true,
      mutual: true,
      peerUsername: friend.username,
    };
  return states;
}
