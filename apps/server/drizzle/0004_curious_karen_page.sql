CREATE TYPE "public"."color_mode" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."app_theme" AS ENUM('sangria', 'crimson-nights', 'midnight-blue', 'royal-ember');--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "theme" "app_theme" DEFAULT 'sangria' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "color_mode" "color_mode" DEFAULT 'dark' NOT NULL;