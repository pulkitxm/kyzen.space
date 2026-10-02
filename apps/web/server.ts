import { createPlatformServer, env, listen } from "@kyzen/server/http";
import next from "next";

const server = createPlatformServer((req, res) => handle(req, res));
const web = next({
  dev: !env.isProd,
  hostname: env.host,
  port: env.port,
  httpServer: server,
});
const handle = web.getRequestHandler();

await web.prepare();
listen(server);
