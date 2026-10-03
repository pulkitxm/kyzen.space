export type TankModelKind = "bastion" | "kestrel";

export type ArenaBox = { x0: number; x1: number; y0: number; y1: number };

export type ArenaLayout = {
  width: number;
  waterY: number;
  boxes: ArenaBox[];
};

export type SceneTank = {
  role: string;
  name: string;
  kind: TankModelKind | null;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  halfWidth: number;
  height: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  aim: number;
  shield: number;
  leaping: boolean;
  local: boolean;
};

type ProjectileKind = "missile" | "shell" | "rocket" | "bomblet" | "bomb";

export type SceneProjectile = {
  id: string;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
};

export type SceneWall = {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
};

export type PickupModelKind = "repair" | "overcharge" | "plating" | "coolant";

export type ScenePickup = {
  id: string;
  kind: PickupModelKind;
  x: number;
  y: number;
};

export type SceneMine = { id: string; x: number; y: number };

export type SceneFrame = {
  tanks: SceneTank[];
  projectiles: SceneProjectile[];
  walls: SceneWall[];
  pickups: ScenePickup[];
  mines: SceneMine[];
};

export type SceneEvent =
  | { type: "fire"; role: string; x: number; y: number }
  | { type: "explode"; x: number; y: number; radius: number }
  | { type: "damage"; role: string; amount: number; color: number }
  | { type: "jump"; role: string; x: number; y: number }
  | { type: "leap"; role: string; x: number; y: number }
  | { type: "land"; role: string; x: number; y: number }
  | { type: "shield"; role: string }
  | { type: "wall"; x: number; y: number }
  | { type: "split"; x: number; y: number }
  | { type: "mine"; x: number; y: number }
  | { type: "pickup"; x: number; y: number; kind: PickupModelKind }
  | { type: "portal"; y: number }
  | { type: "splash"; x: number }
  | { type: "eliminate"; role: string; x: number; y: number };

export type AimPreview = {
  role: string;
  points: { x: number; y: number }[];
  locked: boolean;
  wall: { x0: number; y0: number; x1: number; y1: number } | null;
  shieldRadius: number;
  target: { x: number; y: number } | null;
};

export type CameraFocus =
  | { mode: "tank"; role: string }
  | { mode: "action" }
  | { mode: "overview" };

export type ArenaMountOptions = {
  overlay: HTMLElement | null;
  minimap: HTMLCanvasElement | null;
  reducedMotion: boolean;
  onContextLost: () => void;
};

export type ArenaHandle = {
  setLayout: (layout: ArenaLayout) => void;
  setFrame: (frame: SceneFrame) => void;
  emit: (events: SceneEvent[]) => void;
  setAim: (aim: AimPreview | null) => void;
  setAirstrike: (columns: number[] | null) => void;
  setFocus: (focus: CameraFocus) => void;
  setReducedMotion: (reduced: boolean) => void;
  setInsets: (insets: { top: number; bottom: number }) => void;
  setTicker: (ticker: ((dtMs: number) => void) | null) => void;
  screenToWorld: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number } | null;
  worldToScreen: (x: number, y: number) => { x: number; y: number } | null;
  dispose: () => void;
};

export type PreviewHandle = {
  setKind: (kind: TankModelKind, color: number) => void;
  dispose: () => void;
};
