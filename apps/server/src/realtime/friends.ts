import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import {
  clientFriendRemoveSchema,
  clientFriendRequestSchema,
  clientFriendRespondSchema,
} from "@gamelobby/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
import * as friendsService from "../chat/friends-service";
import { ack, ackErr, register } from "./socket-util";

export function attachFriendHandlers(_io: IOServer, socket: Socket): void {
  const userId = socket.data.userId;

  register(socket, CHAT_EVENTS.friendRequest, async (payload, cb) => {
    const parsed = clientFriendRequestSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "username required");
    ack(
      cb,
      await friendsService.sendFriendRequest(userId, parsed.data.username),
      "request",
    );
  });

  register(socket, CHAT_EVENTS.friendRespond, async (payload, cb) => {
    const parsed = clientFriendRespondSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "requestId required");
    const action = parsed.data.action === "decline" ? "decline" : "accept";
    ack(
      cb,
      await friendsService.respondToRequest(
        userId,
        parsed.data.requestId,
        action,
      ),
      "friendship",
    );
  });

  register(socket, CHAT_EVENTS.friendRemove, async (payload, cb) => {
    const parsed = clientFriendRemoveSchema.safeParse(payload);
    if (!parsed.success) return ackErr(cb, "userId required");
    ack(
      cb,
      await friendsService.removeFriend(userId, parsed.data.userId),
      "ok",
    );
  });
}
