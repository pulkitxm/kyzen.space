import { notifications } from "@kyzen/database";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import type {
  NotificationPayload,
  NotificationType,
} from "@kyzen/shared/types";
import { assembleNotification } from "../chat/assemble";
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
