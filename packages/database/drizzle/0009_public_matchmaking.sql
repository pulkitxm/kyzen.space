ALTER TABLE "game" ADD COLUMN "public_match" boolean DEFAULT false NOT NULL;
CREATE TABLE "matchmaking_ticket" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "owner" text NOT NULL,
  "game_type" text NOT NULL,
  "config" jsonb NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);
CREATE INDEX "matchmaking_ticket_pool_idx" ON "matchmaking_ticket"("game_type", "joined_at");
