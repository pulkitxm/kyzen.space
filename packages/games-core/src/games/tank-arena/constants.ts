import {
  TANK_ARENA_MAX_ROUND,
  type TankKind,
  type TankPickupKind,
  tankActionSchema,
  tankKindSchema,
  tankPickupKindSchema,
} from "@kyzen/shared/types";

export const TANK_KINDS: readonly TankKind[] = tankKindSchema.options;
export const ACTIONS = tankActionSchema.options;
export const PICKUP_KINDS: readonly TankPickupKind[] =
  tankPickupKindSchema.options;

export const STEP = 1 / 60;
export const STEPS_PER_SECOND = 60;
export const GRAVITY = 30;
export const MODULE_WIDTH = 32;
export const TERRAIN_CELL_WIDTH = 8;
export const WATER_Y = -6;
export const MAX_ROUND = TANK_ARENA_MAX_ROUND;

export const SELECT_MS = 20_000;
export const FIRST_PLANNING_MS = 25_000;
export const PLANNING_MS = 22_000;
export const RESULTS_MS = 1500;

export const ACTION_MAX_STEPS = 540;
export const AIRSTRIKE_MAX_STEPS = 240;
export const SELF_DESTRUCT_MAX_STEPS = 120;
export const REST_STEPS = 20;
export const REST_SPEED = 0.05;
export const GROUND_FRICTION = 7 / 15;
export const RESTITUTION = 0.15;
export const PROJECTILE_LIFETIME_STEPS = 360;

export const MIN_POWER = 0.15;
export const JUMP_MIN_ANGLE = 10;
export const JUMP_MAX_ANGLE = 170;
export const LEAP_SPEED_FACTOR = 1.4;
export const SHIELD_MARGIN = 0.9;
export const WALL_DISTANCE = 2.5;
export const WALL_LENGTH = 3.2;
export const WALL_SPEED_KEEP = 0.9;
export const MORTAR_FAN_DEG = 4;
export const CLUSTER_OFFSETS = [-6, -3, 0, 3, 6] as const;

export const MIN_FALLOFF = 0.4;
export const SELF_DAMAGE_FACTOR = 0.5;
export const OVERCHARGE_FACTOR = 1.5;
export const PLATING_FACTOR = 0.5;
export const PLATING_ROUNDS = 2;
export const REPAIR_HP = 40;
export const PICKUP_RADIUS = 0.8;
export const MINE_RADIUS = 0.9;
export const MINE_TRIGGER_DISTANCE = 1.5;
export const MINE_LIFT = 0.25;
export const ITEM_SPACING = 3;
export const MINE_TANK_CLEARANCE = 4;

export const BOMB_SPAWN_Y = 34;
export const BOMB_SPAWN_VY = -8;

export const FORFEIT_STRIKES = 3;

export type BlastKind =
  | "missile"
  | "shell"
  | "rocket"
  | "bomblet"
  | "bomb"
  | "mine"
  | "shockwave"
  | "selfDestruct";

export type BlastSpec = { damage: number; radius: number; knockback: number };

export const BLASTS: Record<BlastKind, BlastSpec> = {
  missile: { damage: 25, radius: 3, knockback: 10 },
  shell: { damage: 18, radius: 2.4, knockback: 10 },
  rocket: { damage: 14, radius: 2, knockback: 10 },
  bomblet: { damage: 14, radius: 2, knockback: 10 },
  bomb: { damage: 28, radius: 2.6, knockback: 10 },
  mine: { damage: 40, radius: 2.5, knockback: 12 },
  shockwave: { damage: 22, radius: 3.5, knockback: 18 },
  selfDestruct: { damage: 20, radius: 3.2, knockback: 10 },
};

export type SpecialSpec = {
  name: string;
  description: string;
  cooldown: number;
};

export type TankSpec = {
  name: string;
  role: string;
  maxHp: number;
  mass: number;
  halfWidth: number;
  halfHeight: number;
  maxJumpSpeed: number;
  maxShotSpeed: number;
  accuracy: number;
  spreadDeg: number;
  guideFraction: number;
  armor: number;
  shieldCapacity: number;
  specialA: SpecialSpec;
  specialB: SpecialSpec;
};

export const TANKS: Record<TankKind, TankSpec> = {
  bastion: {
    name: "Bastion",
    role: "Heavy",
    maxHp: 160,
    mass: 1.8,
    halfWidth: 1.4,
    halfHeight: 1.2,
    maxJumpSpeed: 15,
    maxShotSpeed: 32,
    accuracy: 55,
    spreadDeg: 3,
    guideFraction: 0.4,
    armor: 0.15,
    shieldCapacity: 45,
    specialA: {
      name: "Siege Mortar",
      description: "Three shells fanned 4 degrees apart, 18 damage each.",
      cooldown: 3,
    },
    specialB: {
      name: "Bulwark Wall",
      description:
        "Plants a barrier that reflects enemy projectiles for the round.",
      cooldown: 4,
    },
  },
  kestrel: {
    name: "Kestrel",
    role: "Light",
    maxHp: 120,
    mass: 0.75,
    halfWidth: 1.05,
    halfHeight: 0.9,
    maxJumpSpeed: 23,
    maxShotSpeed: 34,
    accuracy: 85,
    spreadDeg: 0.8,
    guideFraction: 0.85,
    armor: 0,
    shieldCapacity: 25,
    specialA: {
      name: "Starfall Cluster",
      description: "A rocket that splits into five bomblets at its apex.",
      cooldown: 3,
    },
    specialB: {
      name: "Thruster Leap",
      description: "A long untouchable leap that sends a shockwave on landing.",
      cooldown: 2,
    },
  },
};

export const PICKUP_LABELS: Record<TankPickupKind, string> = {
  repair: "Repair",
  overcharge: "Overcharge",
  plating: "Plating",
  coolant: "Coolant",
};
