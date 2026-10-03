import type { ArenaLayout, SceneFrame, SceneTank } from "../view";

type Projector = (x: number, y: number) => { x: number; y: number } | null;

type Plate = {
  element: HTMLElement;
  fill: HTMLElement | null;
  text: HTMLElement | null;
  hp: number;
};

type FloatingNumber = {
  element: HTMLElement;
  role: string;
  age: number;
  life: number;
  stack: number;
};

function hexColor(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export class OverlayLayer {
  private readonly root: HTMLElement | null;
  private plates = new Map<string, Plate>();
  private readonly numbers: FloatingNumber[] = [];
  private lastRefresh = 0;

  constructor(root: HTMLElement | null) {
    this.root = root;
  }

  private refresh(time: number) {
    if (!this.root || time - this.lastRefresh < 0.25) return;
    this.lastRefresh = time;
    const next = new Map<string, Plate>();
    for (const element of this.root.querySelectorAll<HTMLElement>(
      "[data-plate]",
    )) {
      const role = element.dataset.plate;
      if (!role) continue;
      next.set(role, {
        element,
        fill: element.querySelector<HTMLElement>("[data-hp-fill]"),
        text: element.querySelector<HTMLElement>("[data-hp-text]"),
        hp: Number.NaN,
      });
    }
    this.plates = next;
  }

  place(tanks: SceneTank[], project: Projector, time: number) {
    if (!this.root) return;
    let missing = false;
    for (const tank of tanks) {
      const plate = this.plates.get(tank.role);
      if (!plate?.element.isConnected) {
        missing = true;
        continue;
      }
      const element = plate.element;
      const hp = Math.max(0, Math.round(tank.hp));
      if (hp !== plate.hp) {
        plate.hp = hp;
        if (plate.fill) {
          plate.fill.style.width = `${Math.min(100, (hp / Math.max(1, tank.maxHp)) * 100)}%`;
        }
        if (plate.text) plate.text.textContent = `${hp}`;
      }
      const point = tank.alive
        ? project(tank.x, tank.y + tank.height + 0.55)
        : null;
      if (!point) {
        element.style.visibility = "hidden";
        continue;
      }
      element.style.visibility = "visible";
      element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
    if (missing || this.plates.size === 0) this.refresh(time);
  }

  damage(tank: SceneTank, amount: number, color: number) {
    if (!this.root || typeof document === "undefined") return;
    const element = document.createElement("span");
    element.textContent = `-${Math.round(amount)}`;
    element.setAttribute("aria-hidden", "true");
    element.style.position = "absolute";
    element.style.left = "0";
    element.style.top = "0";
    element.style.pointerEvents = "none";
    element.style.fontWeight = "800";
    element.style.fontSize = "18px";
    element.style.color = hexColor(color);
    element.style.textShadow =
      "0 2px 0 rgba(0,0,0,0.75), 0 0 6px rgba(0,0,0,0.6)";
    element.style.willChange = "transform, opacity";
    this.root.appendChild(element);
    const stack = this.numbers.filter(
      (n) => n.role === tank.role && n.age < 0.6,
    ).length;
    this.numbers.push({ element, role: tank.role, age: 0, life: 1.6, stack });
  }

  update(dt: number, tanks: Map<string, SceneTank>, project: Projector) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const entry = this.numbers[i];
      if (!entry) continue;
      entry.age += dt;
      const tank = tanks.get(entry.role);
      const t = entry.age / entry.life;
      if (t >= 1 || !tank) {
        entry.element.remove();
        this.numbers.splice(i, 1);
        continue;
      }
      const point = project(tank.x, tank.y + tank.height + 1.2);
      if (!point) {
        entry.element.style.opacity = "0";
        continue;
      }
      const rise = 18 + t * 46 + entry.stack * 20;
      entry.element.style.opacity = `${Math.min(1, (1 - t) * 2.2)}`;
      entry.element.style.transform = `translate3d(${point.x.toFixed(1)}px, ${(point.y - rise).toFixed(1)}px, 0) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - t) * 1.5})`;
    }
  }

  dispose() {
    for (const entry of this.numbers) entry.element.remove();
    this.numbers.length = 0;
    this.plates.clear();
  }
}

export function drawMinimap(
  canvas: HTMLCanvasElement,
  layout: ArenaLayout,
  frame: SceneFrame,
  view: { x0: number; x1: number },
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const top = 20;
  const bottom = layout.waterY - 1;
  const sx = width / layout.width;
  const sy = height / (top - bottom);
  const mapX = (x: number) => x * sx;
  const mapY = (y: number) => (top - y) * sy;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(8, 20, 32, 0.55)";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(60, 170, 220, 0.35)";
  context.fillRect(0, mapY(layout.waterY), width, height - mapY(layout.waterY));
  context.fillStyle = "rgba(200, 225, 240, 0.65)";
  for (const box of layout.boxes) {
    context.fillRect(
      mapX(box.x0),
      mapY(box.y1),
      Math.max(1, (box.x1 - box.x0) * sx),
      Math.max(1, (box.y1 - box.y0) * sy),
    );
  }
  for (const pickup of frame.pickups) {
    context.fillStyle = "rgba(120, 255, 180, 0.9)";
    context.fillRect(
      mapX(pickup.x) - ratio,
      mapY(pickup.y) - ratio,
      ratio * 2,
      ratio * 2,
    );
  }
  for (const tank of frame.tanks) {
    if (!tank.alive) continue;
    const radius = (tank.local ? 3.2 : 2.4) * ratio;
    context.beginPath();
    context.arc(
      mapX(tank.x),
      mapY(tank.y + tank.height / 2),
      radius,
      0,
      Math.PI * 2,
    );
    context.fillStyle = hexColor(tank.color);
    context.fill();
    if (tank.local) {
      context.lineWidth = ratio;
      context.strokeStyle = "#ffffff";
      context.stroke();
    }
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.lineWidth = ratio;
  context.strokeRect(
    mapX(view.x0),
    1,
    Math.max(4, (view.x1 - view.x0) * sx),
    height - 2,
  );
}
