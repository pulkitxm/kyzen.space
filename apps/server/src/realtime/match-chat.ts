import { friends, games, matchChat } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  clientJoinRoomSchema,
  clientMatchMessageSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
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
      emitToUser(io, player.userId, "match:message", message);
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
    for (const pair of result.connections) {
      const [first, second] = pair;
      if (!first || !second) continue;
      const dm = await createDm(first, second);
      if (!dm.ok) throw new Error(dm.error);
      const connection = await friends.getFriendshipBetween(first, second);
      for (const id of pair) {
        const social = await matchChat.readMatchChat(parsed.data.gameId, id);
        emitToUser(io, id, "match:friends", {
          gameId: parsed.data.gameId,
          peerUsername: social.peerUsername,
          peers: social.peers,
        });
        const friendship = connection
          ? await assembleFriendship(connection, id)
          : null;
        if (friendship)
          emitToUser(io, id, CHAT_EVENTS.friendAccepted, { friendship });
      }
    }
    const social = await matchChat.readMatchChat(
      parsed.data.gameId,
      socket.data.userId,
    );
    cb?.({
      ok: true,
      mutual: social.mutual,
      peerUsername: social.peerUsername,
      peers: social.peers,
    });
  });
}
