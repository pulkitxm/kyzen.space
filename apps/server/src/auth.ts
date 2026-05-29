import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "./db/client";
import { env, googleConfigured } from "./env";
import { childLogger } from "./logger";
import { ensureUsernameForUser } from "./username";

const log = childLogger({ mod: "auth" });

/**
 * Better Auth, backed by the Drizzle/Postgres adapter.
 *
 * Differences from the old Next-embedded config:
 *  - drizzleAdapter (was mongodbAdapter)
 *  - NO nextCookies() plugin — the Express/Hono handler sets cookies itself
 *  - trustedOrigins includes the web origin (CORS/CSRF)
 *  - prod cross-subdomain cookie config for app.x.com ↔ api.x.com
 *  - a user-create hook provisions a user_profile + username on first sign-in
 */
export const auth = betterAuth({
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

/** Kept for parity with call sites that used the old lazy getter. */
export function getAuth(): Auth {
  return auth;
}
