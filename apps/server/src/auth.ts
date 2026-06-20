import { accountMerge, db, schema } from "@kyzen/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { env, googleConfigured } from "./env";
import { generateGuestName } from "./guest-name";
import { childLogger } from "./logger";
import { ensureUsernameForUser } from "./username";

const log = childLogger({ mod: "auth" });

const auth = betterAuth({
  secret: env.betterAuthSecret,
  baseURL: env.betterAuthUrl,
  trustedOrigins: [env.webUrl],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    anonymous({
      disableDeleteAnonymousUser: true,
      generateName: () => generateGuestName(),
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          await accountMerge.recordPending(
            anonymousUser.user.id,
            newUser.user.id,
          );
          log.info(
            { anonId: anonymousUser.user.id, targetId: newUser.user.id },
            "recorded pending account merge",
          );
        } catch (err) {
          log.error(
            { err, anonId: anonymousUser.user.id, targetId: newUser.user.id },
            "failed to record pending account merge",
          );
        }
      },
    }),
  ],
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
            const isAnon =
              (createdUser as { isAnonymous?: boolean }).isAnonymous === true;
            const username = await ensureUsernameForUser(
              createdUser.id,
              createdUser.name,
              { skipGenderDetection: isAnon },
            );
            log.info(
              { userId: createdUser.id, username, isAnon },
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
