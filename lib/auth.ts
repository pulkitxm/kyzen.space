import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { getMongoClient, getMongoDb } from "@/database";

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

const AUTH_SECRET_FALLBACK =
  "dev_only_replace_with_BETTER_AUTH_SECRET_32_chars";

function createAuth() {
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET ?? AUTH_SECRET_FALLBACK,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    database: mongodbAdapter(getMongoDb(), {
      client: getMongoClient(),
      transaction: false,
    }),
    plugins: [nextCookies()],
    socialProviders: {
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
      },
    },
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  authInstance ??= createAuth();
  return authInstance;
}
