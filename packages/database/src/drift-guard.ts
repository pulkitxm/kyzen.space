import type {
  AccountMergeRow,
  AccountRow,
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GamePlayerRow,
  GameRow,
  MessageRow,
  MoveRow,
  NotificationRow,
  SessionRow,
  UserProfileRow,
  UserRow,
  VerificationRow,
} from "@kyzen/shared/types";
import type {
  account,
  accountMerge,
  conversation,
  conversationMember,
  friendship,
  game,
  gamePlayer,
  message,
  move,
  notification,
  session,
  user,
  userProfile,
  verification,
} from "./schema";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

type Expect<T extends true> = T;

export type SchemaDriftChecks = [
  Expect<Equal<typeof user.$inferSelect, UserRow>>,
  Expect<Equal<typeof session.$inferSelect, SessionRow>>,
  Expect<Equal<typeof account.$inferSelect, AccountRow>>,
  Expect<Equal<typeof verification.$inferSelect, VerificationRow>>,
  Expect<Equal<typeof game.$inferSelect, GameRow>>,
  Expect<Equal<typeof move.$inferSelect, MoveRow>>,
  Expect<Equal<typeof gamePlayer.$inferSelect, GamePlayerRow>>,
  Expect<Equal<typeof userProfile.$inferSelect, UserProfileRow>>,
  Expect<Equal<typeof friendship.$inferSelect, FriendshipRow>>,
  Expect<Equal<typeof conversation.$inferSelect, ConversationRow>>,
  Expect<Equal<typeof conversationMember.$inferSelect, ConversationMemberRow>>,
  Expect<Equal<typeof message.$inferSelect, MessageRow>>,
  Expect<Equal<typeof notification.$inferSelect, NotificationRow>>,
  Expect<Equal<typeof accountMerge.$inferSelect, AccountMergeRow>>,
];
