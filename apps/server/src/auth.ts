import { db, schema } from "@gamelobby/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env, googleConfigured } from "./env";
import { childLogger } from "./logger";
import { ensureUsernameForUser } from "./username";

const log = childLogger({ mod: "auth" });

const auth = betterAuth({
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  trustedOrigins: [env.webUrl],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: googleConfigured()
    ? {
        google: {
          clientId: env.googleClientId,
          clientSecret: env.googleClientSecret,
        },
      }
    : {},
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          try {
            const username = await ensureUsernameForUser(
              createdUser.id,
              createdUser.name,
            );
            log.info(
              { userId: createdUser.id, username },
              "provisioned profile on first sign-in",
            );
          } catch (err) {
            log.error(
              { err, userId: createdUser.id },
              "failed to provision profile",
            );
          }
        },
      },
    },
  },
  advanced: env.isProd
    ? {
        crossSubDomainCookies: { enabled: true },
        defaultCookieAttributes: { sameSite: "lax", secure: true },
      }
    : undefined,
});

export type Auth = typeof auth;

export function getAuth(): Auth {
  return auth;
}
