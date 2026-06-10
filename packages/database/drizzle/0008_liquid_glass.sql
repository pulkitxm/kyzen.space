CREATE TYPE "public"."glass_mode" AS ENUM('off', 'neutral', 'tinted', 'smoke');--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "glass" "glass_mode" DEFAULT 'off' NOT NULL;
