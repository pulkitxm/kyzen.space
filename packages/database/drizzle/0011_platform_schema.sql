ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_anonymous" boolean DEFAULT false NOT NULL;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "username_changed_at" timestamp;
ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp;
ALTER TABLE "user_profile" ALTER COLUMN "theme" DROP DEFAULT;
ALTER TABLE "user_profile" ALTER COLUMN "theme" TYPE text;
DROP TYPE "app_theme";
CREATE TYPE "app_theme" AS ENUM('sangria', 'crimson-nights', 'midnight-blue', 'royal-ember', 'forest', 'violet', 'slate', 'amber', 'rose', 'cyan', 'csk');
ALTER TABLE "user_profile" ALTER COLUMN "theme" TYPE "app_theme" USING "theme"::"app_theme";
ALTER TABLE "user_profile" ALTER COLUMN "theme" SET DEFAULT 'amber';
ALTER TABLE "user_profile" ALTER COLUMN "color_mode" SET DEFAULT 'system';
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "code" text;
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "config" jsonb;
ALTER TABLE "game" ADD COLUMN IF NOT EXISTS "series_id" uuid;
DO $$
DECLARE
  game_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_code_uq' AND conrelid = 'game'::regclass) THEN
    ALTER TABLE "game" ADD CONSTRAINT "game_code_uq" UNIQUE("code");
  END IF;
  FOR game_id IN SELECT "id" FROM "game" WHERE "code" IS NULL LOOP
    LOOP
      BEGIN
        UPDATE "game" SET "code" = upper(substr(md5(gen_random_uuid()::text), 1, 6)) WHERE "id" = game_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_series_id_game_id_fk' AND conrelid = 'game'::regclass) THEN
    ALTER TABLE "game" ADD CONSTRAINT "game_series_id_game_id_fk" FOREIGN KEY ("series_id") REFERENCES "game"("id") ON DELETE SET NULL;
  END IF;
END;
$$;
ALTER TABLE "game" ALTER COLUMN "code" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "game_series_idx" ON "game"("series_id");
CREATE TABLE IF NOT EXISTS "game_player" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL CONSTRAINT "game_player_game_id_game_id_fk" REFERENCES "game"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "username" text NOT NULL,
  "role" text NOT NULL,
  "seat_order" integer NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "game_player_uq" UNIQUE("game_id", "user_id")
);
CREATE INDEX IF NOT EXISTS "game_player_user_idx" ON "game_player"("user_id");
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game' AND column_name = 'players') THEN
    INSERT INTO "game_player" ("game_id", "user_id", "username", "role", "seat_order")
    SELECT "game"."id", seat.value->>'userId', seat.value->>'username', seat.value->>'role', seat.position - 1
    FROM "game", jsonb_array_elements("game"."players") WITH ORDINALITY AS seat(value, position)
    ON CONFLICT ("game_id", "user_id") DO NOTHING;
    ALTER TABLE "game" DROP COLUMN "players";
  END IF;
END;
$$;
CREATE TABLE IF NOT EXISTS "account_merge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "anon_user_id" text NOT NULL,
  "target_user_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp
);
CREATE INDEX IF NOT EXISTS "account_merge_target_status_idx" ON "account_merge"("target_user_id", "status");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matchmaking_ticket_user_id_fkey' AND conrelid = 'matchmaking_ticket'::regclass) THEN
    ALTER TABLE "matchmaking_ticket" RENAME CONSTRAINT "matchmaking_ticket_user_id_fkey" TO "matchmaking_ticket_user_id_user_id_fk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_message_game_id_fkey' AND conrelid = 'match_message'::regclass) THEN
    ALTER TABLE "match_message" RENAME CONSTRAINT "match_message_game_id_fkey" TO "match_message_game_id_game_id_fk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_message_sender_id_fkey' AND conrelid = 'match_message'::regclass) THEN
    ALTER TABLE "match_message" RENAME CONSTRAINT "match_message_sender_id_fkey" TO "match_message_sender_id_user_id_fk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_friend_choice_game_id_fkey' AND conrelid = 'match_friend_choice'::regclass) THEN
    ALTER TABLE "match_friend_choice" RENAME CONSTRAINT "match_friend_choice_game_id_fkey" TO "match_friend_choice_game_id_game_id_fk";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_friend_choice_user_id_fkey' AND conrelid = 'match_friend_choice'::regclass) THEN
    ALTER TABLE "match_friend_choice" RENAME CONSTRAINT "match_friend_choice_user_id_fkey" TO "match_friend_choice_user_id_user_id_fk";
  END IF;
END;
$$;
DO $$
BEGIN
  IF (SELECT array_agg(enumlabel::text ORDER BY enumsortorder) FROM pg_enum WHERE enumtypid = 'app_pattern'::regtype) <> ARRAY['doodles', 'shapes', 'games', 'nature', 'space', 'ocean', 'food', 'weather', 'music', 'tech', 'travel', 'animals', 'party', 'love', 'school', 'none'] THEN
    ALTER TABLE "user_profile" ALTER COLUMN "pattern" DROP DEFAULT;
    ALTER TABLE "user_profile" ALTER COLUMN "pattern" TYPE text;
    DROP TYPE "app_pattern";
    CREATE TYPE "app_pattern" AS ENUM('doodles', 'shapes', 'games', 'nature', 'space', 'ocean', 'food', 'weather', 'music', 'tech', 'travel', 'animals', 'party', 'love', 'school', 'none');
    ALTER TABLE "user_profile" ALTER COLUMN "pattern" TYPE "app_pattern" USING "pattern"::"app_pattern";
    ALTER TABLE "user_profile" ALTER COLUMN "pattern" SET DEFAULT 'doodles';
  END IF;
END;
$$;
