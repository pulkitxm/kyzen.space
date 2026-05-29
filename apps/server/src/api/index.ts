import { Hono } from "hono";
import { getAuth } from "../auth";
import { accountRouter } from "./routes/account";
import { gamesRouter } from "./routes/games";
import { matchmakingRouter } from "./routes/matchmaking";
import { profilesRouter } from "./routes/profiles";

// Better Auth owns everything under /api/auth/* (OAuth, session, sign-in/out).
const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono()
  .basePath("/api")
  .route("/auth", authApp)
  .route("/account", accountRouter)
  .route("/games", gamesRouter)
  .route("/matchmaking", matchmakingRouter)
  .route("/profiles", profilesRouter);

export type AppRouter = typeof app;
