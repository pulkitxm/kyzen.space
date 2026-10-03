import { expect, test } from "bun:test";
import { generateDrizzleJson } from "drizzle-kit/api";
import * as schema from "../src/schema";

test("the latest migration snapshot matches the platform schema", async () => {
  const snapshot = await Bun.file(
    new URL("../drizzle/meta/0011_snapshot.json", import.meta.url),
  ).json();
  const current = generateDrizzleJson(schema, snapshot.prevId);
  expect(current.tables).toEqual(snapshot.tables);
  expect(current.enums).toEqual(snapshot.enums);
});
