import { Hono } from "hono";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";
import { accountRouter } from "@/apis/routes/account";

const authApp = new Hono().all("*", async (c) => {
  await ensureMongoConnected();
  return getAuth().handler(c.req.raw);
});

export const app = new Hono()
  .basePath("/api")
  .route("/auth", authApp)
  .route("/account", accountRouter);

export type AppRouter = typeof app;
