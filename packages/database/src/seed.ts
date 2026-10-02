import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { client, db } from "./client";
import * as schema from "./schema";

const url = new URL(process.env.DATABASE_URL ?? "");
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1", "postgres"].includes(url.hostname) ||
  url.pathname !== "/kyzen_dev"
) {
  throw new Error("Demo seeding requires a local kyzen_dev database");
}

const users = [
  { id: "demo-sprout", username: "demo_sprout", name: "Demo Sprout" },
  { id: "demo-pebble", username: "demo_pebble", name: "Demo Pebble" },
];
const conversationId = "00000000-0000-4000-8000-000000000001";
const gameId = "00000000-0000-4000-8000-000000000002";

try {
  await db.transaction(async (tx) => {
    for (const user of users) {
      await tx
        .insert(schema.user)
        .values({
          id: user.id,
          name: user.name,
          email: `${user.username}@example.test`,
          isAnonymous: true,
        })
        .onConflictDoNothing();
      await tx
        .insert(schema.userProfile)
        .values({
          userId: user.id,
          username: user.username,
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(schema.conversation)
      .values({
        id: conversationId,
        kind: "group",
        name: "Demo game night",
        createdBy: "demo-sprout",
      })
      .onConflictDoNothing();
    for (const user of users) {
      await tx
        .insert(schema.conversationMember)
        .values({
          conversationId,
          userId: user.id,
        })
        .onConflictDoNothing();
    }
    await tx
      .insert(schema.message)
      .values({
        id: "00000000-0000-4000-8000-000000000003",
        conversationId,
        senderId: "demo-sprout",
        body: "Welcome to the demo game night!",
      })
      .onConflictDoNothing();
    await tx
      .insert(schema.game)
      .values({
        id: gameId,
        code: "A2K9P7",
        gameType: TIC_TAC_TOE,
        status: "completed",
        winner: "demo-sprout",
        completedAt: new Date("2026-01-01T12:00:00Z"),
        gameState: {
          board: ["X", "X", "X", "O", "O", null, null, null, null],
          currentTurn: "O",
        },
        config: {},
        creatorUserId: "demo-sprout",
        seatingMode: "open",
      })
      .onConflictDoNothing();
    for (const [seatOrder, user] of users.entries()) {
      await tx
        .insert(schema.gamePlayer)
        .values({
          gameId,
          userId: user.id,
          username: user.username,
          role: seatOrder === 0 ? "X" : "O",
          seatOrder,
        })
        .onConflictDoNothing();
    }
    const positions = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ];
    for (const [index, position] of positions.entries()) {
      await tx
        .insert(schema.move)
        .values({
          gameId,
          playerId: index % 2 === 0 ? "demo-sprout" : "demo-pebble",
          moveNumber: index + 1,
          moveData: { row: position[0], col: position[1] },
        })
        .onConflictDoNothing();
    }
  });
  process.stdout.write(
    "Demo profiles, conversation, and room ready. Open /demo_sprout or /play/A2K9P7.\n",
  );
} finally {
  await client.end();
}
