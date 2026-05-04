import { Hono } from "hono";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";
import { accountRouter } from "@/apis/routes/account";
import { gamesRouter } from "@/apis/routes/games";
import { profilesRouter } from "@/apis/routes/profiles";

const authApp = new Hono().all("*", async (c) => {
  await ensureMongoConnected();
  return getAuth().handler(c.req.raw);
});

export const app = new Hono()
  .basePath("/api")
  .route("/auth", authApp)
  .route("/account", accountRouter)
  .route("/games", gamesRouter)
  .route("/profiles", profilesRouter);

export type AppRouter = typeof app;
