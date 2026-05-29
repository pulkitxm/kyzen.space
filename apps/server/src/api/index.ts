import { Hono } from "hono";
import { getAuth } from "../auth";
import { logger } from "../logger";
import { type LoggerEnv, requestLogger } from "./middleware/logger";
import { accountRouter } from "./routes/account";
import { gamesRouter } from "./routes/games";
import { matchmakingRouter } from "./routes/matchmaking";
import { profilesRouter } from "./routes/profiles";

// Better Auth owns everything under /api/auth/* (OAuth, session, sign-in/out).
const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono<LoggerEnv>()
  .basePath("/api")
  // Log every request (method/path/status/durationMs + request id).
  .use("*", requestLogger)
  .route("/auth", authApp)
  .route("/account", accountRouter)
  .route("/games", gamesRouter)
  .route("/matchmaking", matchmakingRouter)
  .route("/profiles", profilesRouter);

// Centralized handler for uncaught errors in any route → log with stack, 500.
app.onError((err, c) => {
  const log = c.get("log") ?? logger;
  log.error(
    { err, method: c.req.method, path: c.req.path },
    "unhandled route error",
  );
  return c.json({ error: "Internal Server Error" }, 500);
});

export type AppRouter = typeof app;
