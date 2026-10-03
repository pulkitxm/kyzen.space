import { friends, matchChat, profiles } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientJoinRoomSchema,
  clientMatchMessageSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import { assembleFriendship } from "../chat/assemble";
import { createDm } from "../chat/conversations-service";
import { emitToGame, emitToUser } from "./rooms";
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
    emitToGame(io, parsed.data.gameId, "match:message", message);
    cb?.({ ok: true, message });
  });
  register(socket, "match:friend", async (payload, cb) => {
    const parsed = clientJoinRoomSchema.safeParse(payload);
    if (!parsed.success) {
      cb?.({ ok: false, error: "Invalid match" });
      return;
    }
    const result = await matchChat.chooseMatchFriend(
      parsed.data.gameId,
      socket.data.userId,
    );
    if (result.mutual) {
      const other = result.userIds.find((id) => id !== socket.data.userId);
      if (other) {
        const dm = await createDm(socket.data.userId, other);
        if (!dm.ok) throw new Error(dm.error);
      }
      const connection = await friends.getFriendshipBetween(
        result.userIds[0] ?? "",
        result.userIds[1] ?? "",
      );
      for (const id of result.userIds) {
        const peerId = result.userIds.find((candidate) => candidate !== id);
        const peerProfile = peerId
          ? await profiles.getProfileByUserId(peerId)
          : null;
        emitToUser(io, id, "match:friends", {
          gameId: parsed.data.gameId,
          peerUsername: peerProfile?.username ?? null,
        });
        const friendship = connection
          ? await assembleFriendship(connection, id)
          : null;
        if (friendship)
          emitToUser(io, id, CHAT_EVENTS.friendAccepted, { friendship });
      }
    }
    const peer = result.mutual
      ? result.userIds.find((id) => id !== socket.data.userId)
      : null;
    const profile = peer ? await profiles.getProfileByUserId(peer) : null;
    cb?.({
      ok: true,
      mutual: result.mutual,
      peerUsername: profile?.username ?? null,
    });
  });
}
