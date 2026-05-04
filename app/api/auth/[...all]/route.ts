import { toNextJsHandler } from "better-auth/next-js";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";

let handlers: ReturnType<typeof toNextJsHandler> | undefined;

function getHandlers() {
  handlers ??= toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request) {
  await ensureMongoConnected();
  return getHandlers().GET(request);
}

export async function POST(request: Request) {
  await ensureMongoConnected();
  return getHandlers().POST(request);
}

export async function PATCH(request: Request) {
  await ensureMongoConnected();
  return getHandlers().PATCH(request);
}

export async function PUT(request: Request) {
  await ensureMongoConnected();
  return getHandlers().PUT(request);
}

export async function DELETE(request: Request) {
  await ensureMongoConnected();
  return getHandlers().DELETE(request);
}
