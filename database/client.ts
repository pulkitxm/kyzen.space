import { MongoClient, type Db } from "mongodb";

let clientSingleton: MongoClient | null = null;
let connecting: Promise<MongoClient> | null = null;

function requireMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error("Missing MONGODB_URI. Configure it in .env.local.");
  }
  return uri.trim();
}

function databaseNameFromUri(connectionString: string): string | undefined {
  try {
    const withoutQuery = connectionString.split("?")[0] ?? connectionString;
    const afterScheme = withoutQuery.split("//")[1];
    if (!afterScheme) return undefined;
    const pathPart = afterScheme.split("/").slice(1).join("/");
    if (!pathPart) return undefined;
    const name = pathPart.replace(/\/$/, "");
    return name || undefined;
  } catch {
    return undefined;
  }
}

export function getMongoClient(): MongoClient {
  if (!clientSingleton) {
    clientSingleton = new MongoClient(requireMongoUri());
  }
  return clientSingleton;
}

export function getMongoDb(): Db {
  const uri = requireMongoUri();
  const name = databaseNameFromUri(uri) ?? "samaan";
  return getMongoClient().db(name);
}

export async function ensureMongoConnected(): Promise<MongoClient> {
  const client = getMongoClient();
  connecting ??= client.connect();
  await connecting;
  return client;
}
