import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db, games, matchChat, schema } from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { eq, sql } from "drizzle-orm";
import { initialState, plainSeats, publicSeats } from "../src/realtime/setup";
import { createHarness, DB_UP, type TestUser } from "./harness";

const ZONE = "Asia/Kolkata";
const NEAR_NOW_MS = 10_000;
const h = createHarness("tz");
const definition = getDefinition(TIC_TAC_TOE);

type Connection = Awaited<ReturnType<typeof db.$client.reserve>>;

async function onEveryConnection<T>(
  run: (connection: Connection) => Promise<T>,
): Promise<T[]> {
  const pool = db.$client;
  const connections = await Promise.all(
    Array.from({ length: pool.options.max }, () => pool.reserve()),
  );
  try {
    return await Promise.all(connections.map(run));
  } finally {
    for (const connection of connections) connection.release();
  }
}

function expectNearNow(at: Date | string | undefined): void {
  expect(Math.abs(new Date(at ?? 0).getTime() - Date.now())).toBeLessThan(
    NEAR_NOW_MS,
  );
}

async function publicMatch() {
  const a = await h.makeUser("a");
  const b = await h.makeUser("b");
  const record = await games.createGame({
    publicMatch: true,
    gameType: TIC_TAC_TOE,
    status: "active",
    players: [
      { userId: a.id, username: a.username, role: "X" },
      { userId: b.id, username: b.username, role: "O" },
    ],
    gameState: initialState(
      definition,
      plainSeats([{ role: "X" }, { role: "O" }]),
      {},
    ),
  });
  h.trackGame(record.id);
  return { a, b, id: record.id, code: record.code };
}

function send(code: string, user: TestUser, body: string) {
  return matchChat.sendMatchMessage({
    code,
    userId: user.id,
    body,
    clientId: crypto.randomUUID(),
  });
}

async function join(userId: string, config: unknown) {
  const result = await games.joinMatchmaking({
    userId,
    owner: userId,
    gameType: TIC_TAC_TOE,
    config,
    seats: publicSeats(definition.engine, 2, config),
    createState: (seats) => initialState(definition, seats, config),
  });
  if (result) h.trackGame(result.code);
  return result;
}

function tickets(userId: string) {
  return db
    .select()
    .from(schema.matchmakingTicket)
    .where(eq(schema.matchmakingTicket.userId, userId));
}

async function ticket(userId: string) {
  const [row] = await tickets(userId);
  if (!row) throw new Error("Ticket missing");
  return row;
}

describe.skipIf(!DB_UP)("non-UTC database session time zone", () => {
  beforeAll(async () => {
    await onEveryConnection(
      (connection) => connection`select set_config('TimeZone', ${ZONE}, false)`,
    );
  });
  afterAll(async () => {
    await onEveryConnection((connection) => connection`reset timezone`);
    await h.cleanup();
  });

  it("runs every pooled connection in the non-UTC zone", async () => {
    const zones = await onEveryConnection(
      (connection) =>
        connection<
          { zone: string }[]
        >`select current_setting('TimeZone') as zone`,
    );
    expect(zones.flat().map((row) => row.zone)).toEqual(
      Array.from({ length: db.$client.options.max }, () => ZONE),
    );
  });

  it("accepts consecutive match messages one second apart", async () => {
    const { a, id, code } = await publicMatch();
    const sent = [await send(code, a, "synthetic one")];
    for (const body of ["synthetic two", "synthetic three"]) {
      await Bun.sleep(1000);
      sent.push(await send(code, a, body));
    }
    expect(
      (await matchChat.readMatchChat(code, a.id)).messages.map(
        (message) => message.body,
      ),
    ).toEqual(["synthetic one", "synthetic two", "synthetic three"]);
    for (const message of sent) expectNearNow(message.createdAt);
    const rows = await db
      .select()
      .from(schema.matchMessage)
      .where(eq(schema.matchMessage.gameId, id));
    expect(rows).toHaveLength(3);
    for (const row of rows)
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(
        7 * 86_400_000,
      );
  });

  it("refuses a second match message within one second", async () => {
    const { a, code } = await publicMatch();
    await send(code, a, "synthetic first");
    await expect(send(code, a, "synthetic second")).rejects.toThrow(
      "Please wait before sending another message",
    );
  });

  it("keeps the post-game friend window at fifteen minutes", async () => {
    const { a, b, id, code } = await publicMatch();
    await games.updateGame(id, {
      status: "completed",
      completedAt: new Date(),
    });
    expect(
      (await matchChat.chooseMatchFriend(code, a.id, `${code}:O`)).mutual,
    ).toBe(false);
    await db
      .update(schema.game)
      .set({ completedAt: sql`now() - interval '16 minutes'` })
      .where(eq(schema.game.id, id));
    await expect(
      matchChat.chooseMatchFriend(code, b.id, `${code}:X`),
    ).rejects.toThrow("The connection window has ended");
    await db
      .update(schema.game)
      .set({ completedAt: sql`now() - interval '14 minutes'` })
      .where(eq(schema.game.id, id));
    expect(
      (await matchChat.chooseMatchFriend(code, b.id, `${code}:X`)).mutual,
    ).toBe(true);
  });

  it("keeps queue age across renewals and expires ticket leases", async () => {
    const a = await h.makeUser("queueA");
    const b = await h.makeUser("queueB");
    const config = { pool: crypto.randomUUID() };
    expect(await join(a.id, config)).toBeNull();
    const first = await ticket(a.id);
    expectNearNow(first.joinedAt);
    expect(first.expiresAt.getTime() - first.joinedAt.getTime()).toBe(45_000);
    await Bun.sleep(50);
    expect(await join(a.id, config)).toBeNull();
    const renewed = await ticket(a.id);
    expect(renewed.joinedAt).toEqual(first.joinedAt);
    expect(renewed.expiresAt.getTime()).toBeGreaterThan(
      first.expiresAt.getTime(),
    );
    await db
      .update(schema.matchmakingTicket)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(schema.matchmakingTicket.userId, a.id));
    expect(await join(b.id, config)).toBeNull();
    await matchChat.purgeExpiredMatchData();
    expect(await tickets(a.id)).toHaveLength(0);
    expect(await tickets(b.id)).toHaveLength(1);
    const matched = await join(a.id, config);
    expect(matched?.userIds.sort()).toEqual([a.id, b.id].sort());
    expectNearNow((await games.getGameByCode(matched?.code ?? ""))?.createdAt);
  });
});
