import { conversations, friends, profiles } from "@gamelobby/database";
import { CHAT_EVENTS } from "@gamelobby/shared/constants";
import type { ConversationJson } from "@gamelobby/shared/types";
import { getIO } from "../realtime/io";
import { convRoom, emitToUser, userRoom } from "../realtime/rooms";
import { assembleConversation } from "./assemble";
import { sendSystemMessage } from "./messages-service";
import { fail, ok, type ServiceResult } from "./result";

async function fanoutConversation(
  conversationId: string,
  memberIds: string[],
  event: string,
): Promise<void> {
  const io = getIO();
  if (!io) return;
  for (const uid of memberIds) {
    io.in(userRoom(uid)).socketsJoin(convRoom(conversationId));
  }
  const conv = await conversations.getById(conversationId);
  if (!conv) return;
  for (const uid of memberIds) {
    const conversation = await assembleConversation(conv, uid);
    emitToUser(io, uid, event, { conversation });
  }
}

export async function createDm(
  userId: string,
  otherUserId: string,
): Promise<ServiceResult<ConversationJson>> {
  if (otherUserId === userId) return fail("Cannot DM yourself");
  if (!(await friends.areFriends(userId, otherUserId))) {
    return fail("You can only message friends", 403);
  }
  const other = await profiles.getPublicUser(otherUserId);
  if (!other) return fail("User not found", 404);

  const { conversation, created } = await conversations.getOrCreateDm(
    userId,
    otherUserId,
  );
  if (created) {
    await fanoutConversation(
      conversation.id,
      [userId, otherUserId],
      CHAT_EVENTS.conversationNew,
    );
  }
  return ok(await assembleConversation(conversation, userId));
}

export async function createGroup(
  userId: string,
  name: string,
  memberIds: string[],
): Promise<ServiceResult<ConversationJson>> {
  const trimmed = name.trim();
  if (!trimmed) return fail("Group name is required");
  if (await conversations.findGroupByName(trimmed)) {
    return fail("A group with this name already exists");
  }

  const candidates = Array.from(new Set(memberIds)).filter(
    (id) => id !== userId,
  );
  const resolved = await profiles.getPublicUsers(candidates);
  const validIds = resolved.map((u) => u.id);

  const conversation = await conversations.createGroup({
    createdBy: userId,
    name: trimmed,
    memberIds: validIds,
  });
  const allMembers = [userId, ...validIds];
  await fanoutConversation(
    conversation.id,
    allMembers,
    CHAT_EVENTS.conversationNew,
  );
  await sendSystemMessage(conversation.id, {
    event: "group_created",
    actorId: userId,
  });
  return ok(await assembleConversation(conversation, userId));
}

export async function addMembers(
  userId: string,
  conversationId: string,
  userIds: string[],
): Promise<ServiceResult<ConversationJson>> {
  const conv = await conversations.getById(conversationId);
  if (conv?.kind !== "group") return fail("Group not found", 404);
  const role = await conversations.getMemberRole(conversationId, userId);
  if (role !== "owner" && role !== "admin") {
    return fail("Only group admins can add members", 403);
  }

  const resolved = await profiles.getPublicUsers(Array.from(new Set(userIds)));
  const toAdd = resolved.map((u) => u.id);
  if (toAdd.length === 0) return fail("No valid users to add");

  await conversations.addMembers(conversationId, toAdd);
  const memberIds = await conversations.getMemberIds(conversationId);
  await fanoutConversation(
    conversationId,
    memberIds,
    CHAT_EVENTS.conversationUpdated,
  );
  for (const targetId of toAdd) {
    await sendSystemMessage(conversationId, {
      event: "member_added",
      actorId: userId,
      targetId,
    });
  }
  return ok(await assembleConversation(conv, userId));
}

export async function removeMember(
  userId: string,
  conversationId: string,
  targetUserId: string,
): Promise<ServiceResult<null>> {
  const conv = await conversations.getById(conversationId);
  if (conv?.kind !== "group") return fail("Group not found", 404);

  const isSelf = targetUserId === userId;
  if (!isSelf) {
    const role = await conversations.getMemberRole(conversationId, userId);
    if (role !== "owner" && role !== "admin") {
      return fail("Only group admins can remove members", 403);
    }
  }

  await conversations.removeMember(conversationId, targetUserId);
  const memberIds = await conversations.getMemberIds(conversationId);
  await fanoutConversation(
    conversationId,
    [...memberIds, targetUserId],
    CHAT_EVENTS.conversationUpdated,
  );
  await sendSystemMessage(conversationId, {
    event: isSelf ? "member_left" : "member_removed",
    actorId: userId,
    targetId: targetUserId,
  });
  const io = getIO();
  if (io) io.in(userRoom(targetUserId)).socketsLeave(convRoom(conversationId));
  return ok(null);
}

export async function renameGroup(
  userId: string,
  conversationId: string,
  name: string,
): Promise<ServiceResult<ConversationJson>> {
  const conv = await conversations.getById(conversationId);
  if (conv?.kind !== "group") return fail("Group not found", 404);
  const role = await conversations.getMemberRole(conversationId, userId);
  if (role !== "owner" && role !== "admin") {
    return fail("Only group admins can rename the group", 403);
  }
  const trimmed = name.trim();
  if (!trimmed) return fail("Group name is required");
  const existing = await conversations.findGroupByName(trimmed);
  if (existing && existing.id !== conversationId) {
    return fail("A group with this name already exists");
  }

  await conversations.renameGroup(conversationId, trimmed);
  const memberIds = await conversations.getMemberIds(conversationId);
  await fanoutConversation(
    conversationId,
    memberIds,
    CHAT_EVENTS.conversationUpdated,
  );
  await sendSystemMessage(conversationId, {
    event: "group_renamed",
    actorId: userId,
    meta: { name: trimmed },
  });
  const updated = await conversations.getById(conversationId);
  if (!updated) return fail("Group not found", 404);
  return ok(await assembleConversation(updated, userId));
}
