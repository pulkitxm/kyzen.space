import { matchChat } from "@kyzen/database";
import {
  clientJoinRoomSchema,
  clientMatchMessageSchema,
} from "@kyzen/shared/types";
import type { Server as IOServer, Socket } from "socket.io";
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
      for (const id of result.userIds)
        emitToUser(io, id, "match:friends", { gameId: parsed.data.gameId });
    }
    cb?.({ ok: true, mutual: result.mutual });
  });
}
