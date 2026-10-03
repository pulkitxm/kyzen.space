import { friends, games, matchChat, profiles } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientMatchFriendSchema,
  clientMatchMessageSchema,
  isBotId,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { publicPlayerId } from "../api/serialize";
import { assembleFriendship } from "../chat/assemble";
import { createDm } from "../chat/conversations-service";
import { emitToUser } from "./rooms";
import { register } from "./socket-util";

export function attachMatchChatHandlers(io: IOServer, socket: Socket): void {
  register(socket, "match:message", async (payload, cb) => {
    const parsed = clientMatchMessageSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid message" });
      return;
    }
    const message = await matchChat.sendMatchMessage({
      code: parsed.data.gameId,
      userId: socket.data.userId,
      body: parsed.data.body,
      clientId: parsed.data.clientId,
    });
    const game = await games.getGameByCode(parsed.data.gameId);
    for (const player of game?.players ?? [])
      if (!isBotId(player.userId))
        emitToUser(io, player.userId, "match:message", message);
    cb?.({ ok: true, message });
  });
  register(socket, "match:friend", async (payload, cb) => {
    const parsed = clientMatchFriendSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid match" });
      return;
    }
    const userId = socket.data.userId;
    const result = await matchChat.chooseMatchFriend(
      parsed.data.gameId,
      userId,
      parsed.data.playerId,
    );
    let peerUsername: string | null = null;
    if (result.mutual) {
      const peerId = result.targetUserId;
      const dm = await createDm(userId, peerId);
      if (!dm.ok) throw new Error(dm.error);
      const game = await games.getGameByCode(parsed.data.gameId);
      const connection = await friends.getFriendshipBetween(userId, peerId);
      for (const [recipient, peer] of [
        [userId, peerId],
        [peerId, userId],
      ] as const) {
        const peerProfile = await profiles.getProfileByUserId(peer);
        if (recipient === userId) peerUsername = peerProfile?.username ?? null;
        emitToUser(io, recipient, "match:friends", {
          gameId: parsed.data.gameId,
          playerId: game ? publicPlayerId(game, peer) : null,
          peerUsername: peerProfile?.username ?? null,
        });
        const friendship = connection
          ? await assembleFriendship(connection, recipient)
          : null;
        if (friendship)
          emitToUser(io, recipient, CHAT_EVENTS.friendAccepted, { friendship });
      }
    }
    cb?.({
      ok: true,
      mutual: result.mutual,
      playerId: parsed.data.playerId,
      peerUsername,
    });
  });
}
