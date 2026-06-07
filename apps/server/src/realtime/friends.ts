import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { Server as IOServer, Socket } from "socket.io";
import * as friendsService from "../chat/friends-service";
import { ack, ackErr, isObj, register, str } from "./socket-util";

export function attachFriendHandlers(_io: IOServer, socket: Socket): void {
  const userId = socket.data.userId;

  register(socket, CHAT_EVENTS.friendRequest, async (payload, cb) => {
    const username = isObj(payload) ? str(payload.username) : null;
    if (!username) return ackErr(cb, "username required");
    ack(
      cb,
      await friendsService.sendFriendRequest(userId, username),
      "request",
    );
  });

  register(socket, CHAT_EVENTS.friendRespond, async (payload, cb) => {
    const requestId = isObj(payload) ? str(payload.requestId) : null;
    const action =
      isObj(payload) && payload.action === "decline" ? "decline" : "accept";
    if (!requestId) return ackErr(cb, "requestId required");
    ack(
      cb,
      await friendsService.respondToRequest(userId, requestId, action),
      "friendship",
    );
  });

  register(socket, CHAT_EVENTS.friendRemove, async (payload, cb) => {
    const otherId = isObj(payload) ? str(payload.userId) : null;
    if (!otherId) return ackErr(cb, "userId required");
    ack(cb, await friendsService.removeFriend(userId, otherId), "ok");
  });
}
