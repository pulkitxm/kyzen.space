import {
  CHAT_EVENTS,
  type NotificationPayload,
  type NotificationType,
} from "@gamelobby/chat-core";
import { assembleNotification } from "../chat/assemble";
import { notifications } from "../db";
import { getIO } from "./io";
import { emitToUser } from "./rooms";

export async function notify(
  userId: string,
  type: NotificationType,
  opts: { actorId?: string | null; payload?: NotificationPayload } = {},
): Promise<void> {
  if (opts.actorId && opts.actorId === userId) return;

  const row = await notifications.create({
    userId,
    type,
    actorId: opts.actorId ?? null,
    payload: opts.payload,
  });

  const io = getIO();
  if (!io) return;
  const notification = await assembleNotification(row);
  emitToUser(io, userId, CHAT_EVENTS.notificationNew, { notification });
}
