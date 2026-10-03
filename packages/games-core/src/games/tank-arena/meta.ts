import { GAME_CATEGORIES, TANK_ARENA } from "@kyzen/shared/constants";
import type { GameMeta } from "@kyzen/shared/types";

export const tankArenaMeta: GameMeta = {
  type: TANK_ARENA,
  name: "Tank Arena",
  description:
    "Lock your shot in secret, then watch every tank fire at once across a frozen foundry.",
  categoryId: GAME_CATEGORIES.PARTY.id,
  coverImage: "/games/tank-arena-cover.png",
  backgroundMusic: "/sounds/tank-arena-bg.ogg",
  howToPlay: [
    "Pick a tank: Bastion is heavy, armored, and inaccurate; Kestrel is light, agile, and precise.",
    "Each round every living tank secretly locks one plan: a missile, a jump, a shield, or one of its two specials.",
    "Drag from your tank to aim. The guide shows only part of the arc, and less of it for less accurate tanks.",
    "When everyone has locked, all plans play out at the same time. Blasts need a clear line to hurt, so cover matters.",
    "Grab pickups for repairs, overcharged shots, plating, or coolant, and avoid mines and the pit.",
    "The green portals at the map edges wrap tanks and shots to the other side. Watch for airstrike warnings.",
    "The last team with a tank standing wins. After round 40 the team with the most health left wins.",
  ],
};
