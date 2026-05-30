export type AvatarStyle = "feminine" | "masculine" | "any";

export type AvatarConfig = {
  skinColor: string;
  top: string;
  hairColor: string;
  hatColor: string;
  accessories: string;
  accessoriesColor: string;
  facialHair: string;
  facialHairColor: string;
  clothing: string;
  clothesColor: string;
  eyes: string;
  eyebrows: string;
  mouth: string;
  backgroundColor: string;
  style?: AvatarStyle;
};

export type AvatarOptionKey =
  | "top"
  | "accessories"
  | "facialHair"
  | "clothing"
  | "eyes"
  | "eyebrows"
  | "mouth";

export type AvatarColorKey =
  | "skinColor"
  | "hairColor"
  | "hatColor"
  | "accessoriesColor"
  | "facialHairColor"
  | "clothesColor"
  | "backgroundColor";
