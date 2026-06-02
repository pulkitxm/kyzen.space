import { Hono } from "hono";
import { getAuth } from "../auth";
import { logger } from "../logger";
import { type LoggerEnv, requestLogger } from "./middleware/logger";
import { accountRouter } from "./routes/account";
import { conversationsRouter } from "./routes/conversations";
import { friendsRouter } from "./routes/friends";
import { gamesRouter } from "./routes/games";
import { gifsRouter } from "./routes/gifs";
import { messagesRouter } from "./routes/messages";
import { notificationsRouter } from "./routes/notifications";
import { profilesRouter } from "./routes/profiles";

const authApp = new Hono().all("*", (c) => getAuth().handler(c.req.raw));

export const app = new Hono<LoggerEnv>()
  .basePath("/api")
  .use("*", requestLogger)
  .route("/auth", authApp)
  .route("/account", accountRouter)
  .route("/games", gamesRouter)
  .route("/profiles", profilesRouter)
  .route("/friends", friendsRouter)
  .route("/conversations", conversationsRouter)
  .route("/messages", messagesRouter)
  .route("/notifications", notificationsRouter)
  .route("/gifs", gifsRouter);

app.onError((err, c) => {
  const log = c.get("log") ?? logger;
  log.error(
    { err, method: c.req.method, path: c.req.path },
    "unhandled route error",
  );
  return c.json({ error: "Internal Server Error" }, 500);
});

export type AppRouter = typeof app;
