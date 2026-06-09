import {
  conversations,
  generateInviteToken,
  invites,
  profiles,
} from "@gamelobby/database";
import type {
  AvatarConfig,
  GameType,
  SeatingMode,
} from "@gamelobby/shared/types";
import { env } from "../env";
import { notify } from "../realtime/notify";
import { createGameInConversation } from "./games-in-chat-service";
import { fail, ok, type ServiceResult } from "./result";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

type InviterPublic = { username: string; avatar: AvatarConfig | null };

type PeekResult = {
  gameType: GameType | null;
  inviter: InviterPublic | null;
  expired: boolean;
};

const ACCEPT_WINDOW_MS = 60 * 1000;
const ACCEPT_MAX_PER_WINDOW = 20;
const acceptBuckets = new Map<string, number[]>();

function acceptAllowed(inviterUserId: string): boolean {
  const now = Date.now();
  const recent = (acceptBuckets.get(inviterUserId) ?? []).filter(
    (t) => now - t < ACCEPT_WINDOW_MS,
  );
  if (recent.length >= ACCEPT_MAX_PER_WINDOW) {
    acceptBuckets.set(inviterUserId, recent);
    return false;
  }
  recent.push(now);
  acceptBuckets.set(inviterUserId, recent);
  return true;
}

export async function createInvite(input: {
  inviterUserId: string;
  gameType: GameType;
  config?: unknown;
  seatingMode?: SeatingMode | null;
}): Promise<ServiceResult<{ token: string; url: string }>> {
  const token = generateInviteToken();
  await invites.create({
    inviterUserId: input.inviterUserId,
    gameType: input.gameType,
    token,
    config: input.config,
    seatingMode: input.seatingMode ?? null,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const url = `${env.webUrl}/invite/${token}`;
  return ok({ token, url });
}

export async function peekInvite(token: string): Promise<PeekResult> {
  const row = await invites.getByToken(token);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return { gameType: null, inviter: null, expired: true };
  }
  const inviter = await profiles.getPublicUser(row.inviterUserId);
  return {
    gameType: row.gameType as GameType,
    inviter: inviter
      ? { username: inviter.username, avatar: inviter.avatar }
      : null,
    expired: false,
  };
}

export async function acceptInvite(
  token: string,
  accepterUserId: string,
): Promise<
  ServiceResult<{
    gameId: string | null;
    selfInvite: boolean;
    inviter: InviterPublic | null;
  }>
> {
  const row = await invites.getByToken(token);
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return fail("Invite not found or expired", 404);
  }

  const inviterPublic = await profiles.getPublicUser(row.inviterUserId);
  const inviter = inviterPublic
    ? { username: inviterPublic.username, avatar: inviterPublic.avatar }
    : null;

  if (row.inviterUserId === accepterUserId) {
    return ok({ gameId: null, selfInvite: true, inviter });
  }

  if (!acceptAllowed(row.inviterUserId)) {
    return fail("Too many invites accepted, try again shortly", 409);
  }

  const { conversation } = await conversations.getOrCreateDm(
    row.inviterUserId,
    accepterUserId,
  );

  const created = await createGameInConversation({
    userId: row.inviterUserId,
    conversationId: conversation.id,
    gameType: row.gameType as GameType,
    seatingMode: "challenge",
    challengedUserId: accepterUserId,
    config: row.config ?? undefined,
  });
  if (!created.ok) return fail(created.error, created.status);

  await notify(row.inviterUserId, "game_invite", {
    actorId: accepterUserId,
    payload: { gameId: created.value.game.id },
  });

  return ok({ gameId: created.value.game.id, selfInvite: false, inviter });
}
