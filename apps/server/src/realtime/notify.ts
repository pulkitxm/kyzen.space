import {
  CHAT_EVENTS,
  type NotificationPayload,
  type NotificationType,
} from "@gamelobby/chat-core";
import { assembleNotification } from "../chat/assemble";
import { notifications } from "../db";
import { getIO } from "./io";
import { emitToUser } from "./rooms";

/**
 * Persist a notification (so offline recipients get it on next load) and push it
 * to the recipient's user room in realtime. Never notifies the actor of their own
 * action. Call this AFTER the triggering mutation has committed.
 */
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
