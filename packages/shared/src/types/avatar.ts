import { z } from "zod";

export type {
  AvatarColorKey,
  AvatarConfig,
  AvatarOptionKey,
  AvatarStyle,
} from "@gamelobby/avatar";

export const avatarConfigSchema = z.object({
  skinColor: z.string(),
  top: z.string(),
  hairColor: z.string(),
  hatColor: z.string(),
  accessories: z.string(),
  accessoriesColor: z.string(),
  facialHair: z.string(),
  facialHairColor: z.string(),
  clothing: z.string(),
  clothesColor: z.string(),
  eyes: z.string(),
  eyebrows: z.string(),
  mouth: z.string(),
  backgroundColor: z.string(),
  style: z.enum(["feminine", "masculine", "any"]).optional(),
});
