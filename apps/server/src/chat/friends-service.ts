import { friends, notifications, profiles } from "@gamelobby/database";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { FriendshipJson } from "@gamelobby/shared/types";
import { getIO } from "../realtime/io";
import { notify } from "../realtime/notify";
import { emitToUser } from "../realtime/rooms";
import { assembleFriendship } from "./assemble";
import { fail, ok, type ServiceResult } from "./result";

export async function sendFriendRequest(
  requesterId: string,
  username: string,
): Promise<ServiceResult<FriendshipJson>> {
  const profile = await profiles.getProfileByUsername(username);
  if (!profile) return fail("User not found", 404);
  const addresseeId = profile.userId;
  if (addresseeId === requesterId) return fail("You can't add yourself");

  const existing = await friends.getFriendshipBetween(requesterId, addresseeId);
  let row = existing;
  if (existing) {
    if (existing.status === "accepted") return fail("Already friends", 409);
    if (existing.status === "pending") {
      if (existing.addresseeId === requesterId) {
        row = await friends.setStatus(existing.id, "accepted");
      } else {
        return fail("Friend request already sent", 409);
      }
    } else {
      row = await friends.reopenRequest(existing.id, requesterId, addresseeId);
    }
  } else {
    row = await friends.createRequest(requesterId, addresseeId);
  }
  if (!row) return fail("Failed to create request", 500);

  const io = getIO();
  if (row.status === "accepted") {
    if (io) {
      const forA = await assembleFriendship(row, addresseeId);
      if (forA) {
        emitToUser(io, addresseeId, CHAT_EVENTS.friendAccepted, {
          friendship: forA,
        });
      }
    }
    await notify(addresseeId, "friend_accepted", {
      actorId: requesterId,
      payload: { requestId: row.id },
    });
  } else {
    if (io) {
      const forA = await assembleFriendship(row, addresseeId);
      if (forA) {
        emitToUser(io, addresseeId, CHAT_EVENTS.friendRequestNew, {
          friendship: forA,
        });
      }
    }
    await notify(addresseeId, "friend_request", {
      actorId: requesterId,
      payload: { requestId: row.id },
    });
  }

  const forRequester = await assembleFriendship(row, requesterId);
  if (!forRequester) return fail("Failed to load request", 500);
  return ok(forRequester);
}

export async function respondToRequest(
  userId: string,
  requestId: string,
  action: "accept" | "decline",
): Promise<ServiceResult<FriendshipJson | null>> {
  const row = await friends.getById(requestId);
  if (!row) return fail("Request not found", 404);
  if (row.addresseeId !== userId) return fail("Not your request", 403);
  if (row.status !== "pending") return fail("Request already answered", 409);

  const updated = await friends.setStatus(
    requestId,
    action === "accept" ? "accepted" : "declined",
  );
  if (!updated) return fail("Failed to update request", 500);

  await notifications.resolveByRequestId(userId, "friend_request", requestId);

  const requesterId = row.requesterId;
  const io = getIO();

  if (action === "accept") {
    if (io) {
      const forRequester = await assembleFriendship(updated, requesterId);
      if (forRequester) {
        emitToUser(io, requesterId, CHAT_EVENTS.friendAccepted, {
          friendship: forRequester,
        });
      }
    }
    await notify(requesterId, "friend_accepted", {
      actorId: userId,
      payload: { requestId },
    });
    return ok(await assembleFriendship(updated, userId));
  }

  if (io) {
    emitToUser(io, requesterId, CHAT_EVENTS.friendDeclined, {
      id: requestId,
      userId,
    });
  }
  return ok(null);
}

export async function removeFriend(
  userId: string,
  otherUserId: string,
): Promise<ServiceResult<null>> {
  await friends.removeFriendship(userId, otherUserId);
  const io = getIO();
  if (io) {
    emitToUser(io, otherUserId, CHAT_EVENTS.friendRemoved, { userId });
  }
  return ok(null);
}
