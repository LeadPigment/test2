import * as THREE from "three";
import { generateMaze, MazeData } from "./maze";
import { BIOMES, BiomeId, BIOME_LIST } from "./biomes";
import { buildWorld, World, MOODS, CELL, cellCenter } from "./world";
import { Sfx } from "./audio";

export type GameState = "menu" | "playing" | "paused";
export const HOLD_TIME = 0.5;

export interface Snapshot {
  state: GameState;
  biome: BiomeId;
  sector: number;
  cardinal: boolean;
  mapOpen: boolean;
  muted: boolean;
  discovered: BiomeId[];
  visited: number;
  totalRooms: number;
  allFound: boolean;
  finaleDismissed: boolean;
  elapsed: number;
}

export interface ViewHandles {
  setSnap: (s: Snapshot) => void;
  toast: (title: string, color: string, sub?: string) => void;
  setRing: (progress: number, valid: boolean, busy: boolean) => void;
  setNeedle: (deg: number) => void;
  setSector: (idx: number) => void;
  setKeyFill: (key: "w" | "a" | "s" | "d", f: number, pressed: boolean, blocked: boolean) => void;
  bumpFlash: () => void;
}

interface KeyTrack {
  down: boolean;
  held: number;
}
type Action =
  | { type: "move"; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; step: boolean }
  | { type: "turn"; from: number; to: number; t: number; dur: number; sign: number }
  | { type: "bump"; dir: THREE.Vector3; t: number; dur: number };

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const CARDINAL_VEC = [
  { x: 0, y: -1 }, // 0 N
  { x: -1, y: 0 }, // 1 W
  { x: 0, y: 1 },  // 2 S
  { x: 1, y: 0 },  // 3 E
];

export class Engine {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private maze: MazeData;
  private world: World;
  private sfx = new Sfx();
  private view: ViewHandles | null = null;
  private mapCanvas: HTMLCanvasElement | null = null;

  state: GameState = "menu";
  private cellX: number;
  private cellY: number;
  private pos: THREE.Vector3;
  private yaw = 0;
  private pitch = -0.06;
  private roll = 0;
  private keys: Record<"w" | "a" | "s" | "d", KeyTrack> = {
    w: { down: false, held: 0 },
    a: { down: false, held: 0 },
    s: { down: false, held: 0 },
    d: { down: false, held: 0 },
  };
  private lookVel = { yaw: 0, pitch: 0 };
  private action: Action | null = null;
  private trauma = 0;
  private bob = 0;

  private biome: BiomeId;
  private discovered = new Set<BiomeId>();
  private visitedRooms = new Set<number>();
  private seen = new Set<number>();
  private mapOpen = true;
  private allFound = false;
  private finaleDismissed = false;
  private elapsed = 0;
  private lastMapDraw = 0;
  private lastSnap = "";

  // mood interpolation state
  private mood = {
    fog: new THREE.Color(MOODS.basement.fog),
    near: 3, far: 21,
    hemiSky: new THREE.Color(MOODS.basement.hemiSky),
    hemiGround: new THREE.Color(MOODS.basement.hemiGround),
    hemiI: MOODS.basement.hemiI,
    sunI: MOODS.basement.sunI,
    sunColor: new THREE.Color(MOODS.basement.sunColor),
    lamp: new THREE.Color(BIOMES.basement.lamp),
    lampI: BIOMES.basement.lampIntensity,
    openness: 0,
  };
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private lamp: THREE.PointLight;

  private raf = 0;
  private lastT = performance.now();
  private time = 0;
  private disposed = false;
  private drag: { on: boolean; x: number; y: number } = { on: false, x: 0, y: 0 };
  private canvas: HTMLCanvasElement;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.maze = generateMaze((Date.now() % 100000) + 7);
    this.cellX = this.maze.start.x;
    this.cellY = this.maze.start.y;
    this.pos = cellCenter(this.cellX, this.cellY, this.maze.w);
    this.biome = this.biomeAt(this.cellX, this.cellY);
    this.discovered.add(this.biome);
    this.visitedRooms.add(this.cellY * this.maze.w + this.cellX);
    this.reveal();

    this.world = buildWorld(this.maze);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
    this.camera.rotation.order = "YXZ";

    // fetch lights added by world (first HemisphereLight / DirectionalLight)
    let hemi: THREE.HemisphereLight | null = null;
    let sun: THREE.DirectionalLight | null = null;
    this.world.scene.traverse((o) => {
      if (!hemi && o instanceof THREE.HemisphereLight) hemi = o;
      if (!sun && o instanceof THREE.DirectionalLight) sun = o;
    });
    this.hemi = hemi!;
    this.sun = sun!;
    this.lamp = new THREE.PointLight(0xffb45e, 7, 11, 1.8);
    this.world.scene.add(this.lamp);

    this.onResize = () => this.resize();
    this.onKeyDown = (e) => this.keyDown(e);
    this.onKeyUp = (e) => this.keyUp(e);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    canvas.addEventListener("pointerdown", (e) => {
      this.drag.on = true;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.drag.on || this.state !== "playing") return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (!this.action || this.action.type !== "turn") this.yaw += dx * 0.0042;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0036, -1.25, 1.25);
    });
    const endDrag = () => (this.drag.on = false);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    this.resize();
    this.snapMood();
    this.loop(performance.now());
  }

  attachView(v: ViewHandles) {
    this.view = v;
  }
  attachMinimap(c: HTMLCanvasElement | null) {
    this.mapCanvas = c;
    this.lastMapDraw = 0;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- input ----------
  private keyDown(e: KeyboardEvent) {
    const c = e.code;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(c)) e.preventDefault();
    if (c === "Escape" && (this.state === "playing" || this.state === "paused")) {
      this.togglePause();
      return;
    }
    if (c === "KeyM" && this.state !== "menu") {
      this.toggleMap();
      return;
    }
    if (e.repeat) return;
    const map: Record<string, "w" | "a" | "s" | "d"> = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d" };
    if (map[c]) this.keys[map[c]].down = true;
    if (c === "ArrowLeft") this.lookVel.yaw = 2.4;
    if (c === "ArrowRight") this.lookVel.yaw = -2.4;
    if (c === "ArrowUp") this.lookVel.pitch = 1.5;
    if (c === "ArrowDown") this.lookVel.pitch = -1.5;
  }
  private keyUp(e: KeyboardEvent) {
    const c = e.code;
    const map: Record<string, "w" | "a" | "s" | "d"> = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d" };
    if (map[c]) {
      this.keys[map[c]].down = false;
      this.keys[map[c]].held = 0;
    }
    if ((c === "ArrowLeft" && this.lookVel.yaw > 0) || (c === "ArrowRight" && this.lookVel.yaw < 0)) this.lookVel.yaw = 0;
    if ((c === "ArrowUp" && this.lookVel.pitch > 0) || (c === "ArrowDown" && this.lookVel.pitch < 0)) this.lookVel.pitch = 0;
  }

  setVirtualKey(k: "w" | "a" | "s" | "d", down: boolean) {
    if (down && this.state === "menu") return;
    this.keys[k].down = down;
    if (!down) this.keys[k].held = 0;
  }

  // ---------- public controls ----------
  startGame() {
    this.sfx.ensure();
    this.sfx.startDrone();
    this.sfx.click();
    this.state = "playing";
    this.snapMood();
    this.sfx.setDroneMood(MOODS[this.biome].openness);
    this.pushSnap(true);
  }
  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.sfx.click();
    } else if (this.state === "paused") {
      this.state = "playing";
      this.sfx.click();
      this.lastT = performance.now();
    }
    this.pushSnap(true);
  }
  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.sfx.click();
    this.lastMapDraw = 0;
    this.pushSnap(true);
  }
  toggleMute() {
    this.sfx.setMuted(!this.sfx.muted);
    this.pushSnap(true);
  }
  dismissFinale() {
    this.finaleDismissed = true;
    this.pushSnap(true);
  }

  // ---------- helpers ----------
  private biomeAt(x: number, y: number): BiomeId {
    const i = this.maze.biome[y * this.maze.w + x];
    return (BIOME_LIST as BiomeId[])[i] ?? "basement";
  }
  private isWalkable(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.maze.w && y < this.maze.h && !!this.maze.grid[y * this.maze.w + x];
  }
  private sectorOf(yaw: number) {
    const deg = ((yaw * 180) / Math.PI) % 360;
    const a = (deg + 360) % 360;
    return Math.round(a / 45) % 8;
  }
  private reveal() {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = this.cellX + dx;
        const y = this.cellY + dy;
        if (x >= 0 && y >= 0 && x < this.maze.w && y < this.maze.h) this.seen.add(y * this.maze.w + x);
      }
  }
  private snapMood() {
    const m = MOODS[this.biome];
    const b = BIOMES[this.biome];
    this.mood.fog.set(m.fog);
    this.mood.near = m.near;
    this.mood.far = m.far;
    this.mood.hemiSky.set(m.hemiSky);
    this.mood.hemiGround.set(m.hemiGround);
    this.mood.hemiI = m.hemiI;
    this.mood.sunI = m.sunI;
    this.mood.sunColor.set(m.sunColor);
    this.mood.lamp.set(b.lamp);
    this.mood.lampI = b.lampIntensity;
    this.mood.openness = m.openness;
  }

  private enterCell(x: number, y: number) {
    this.cellX = x;
    this.cellY = y;
    this.reveal();
    const b = this.biomeAt(x, y);
    if (b !== this.biome) {
      this.biome = b;
      const def = BIOMES[b];
      this.sfx.setDroneMood(MOODS[b].openness);
      if (!this.discovered.has(b)) {
        this.discovered.add(b);
        this.sfx.discover();
        this.view?.toast(`发现新群系「${def.name}」`, def.accent, `${def.desc} · ${this.discovered.size}/8`);
        if (this.discovered.size === 8 && !this.allFound) {
          this.allFound = true;
          this.sfx.fanfare();
        }
      } else {
        this.sfx.chime(520);
        this.view?.toast(`进入「${def.name}」`, def.accent, def.en);
      }
    }
    if (x % 2 === 1 && y % 2 === 1) this.visitedRooms.add(y * this.maze.w + x);
  }

  // ---------- actions ----------
  private tryMove(sign: 1 | -1) {
    const sector = this.sectorOf(this.yaw);
    if (sector % 2 !== 0) return false; // must face a cardinal window
    const k = Math.round((((this.yaw * 180) / Math.PI) % 360 + 360) % 360 / 90) % 4;
    const v = CARDINAL_VEC[k];
    const tx = this.cellX + v.x * sign;
    const ty = this.cellY + v.y * sign;
    if (this.isWalkable(tx, ty)) {
      const from = this.pos.clone();
      const to = cellCenter(tx, ty, this.maze.w);
      this.action = { type: "move", from, to, t: 0, dur: 0.42, step: false };
      this.sfx.step();
      return true;
    }
    this.action = { type: "bump", dir: new THREE.Vector3(v.x * sign, 0, v.y * sign), t: 0, dur: 0.34 };
    this.trauma = Math.min(this.trauma + 0.55, 1);
    this.sfx.bump();
    this.view?.bumpFlash();
    return true;
  }
  private tryTurn(sign: 1 | -1) {
    const snapped = Math.round(this.yaw / (Math.PI / 2)) * (Math.PI / 2);
    this.action = { type: "turn", from: this.yaw, to: snapped + sign * (Math.PI / 2), t: 0, dur: 0.3, sign };
    this.sfx.turn();
    return true;
  }

  // ---------- frame ----------
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.lastT) / 1000, 0.05);
    this.lastT = now;

    if (this.state !== "paused") {
      this.time += dt;
      this.update(dt);
    }
    this.render(dt);
    this.pushSnap(false);
  };

  private update(dt: number) {
    if (this.state === "menu") {
      this.yaw += dt * 0.16;
      this.pitch = -0.05 + Math.sin(this.time * 0.4) * 0.05;
      return;
    }
    this.elapsed += dt;

    // free look via arrows
    if (!this.action || this.action.type !== "turn") {
      this.yaw += this.lookVel.yaw * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch + this.lookVel.pitch * dt, -1.25, 1.25);
    }

    // action progression
    if (this.action) {
      const a = this.action;
      a.t += dt / a.dur;
      if (a.type === "move") {
        const e = easeInOutCubic(Math.min(a.t, 1));
        this.pos.lerpVectors(a.from, a.to, e);
        this.bob = Math.sin(e * Math.PI * 2) * 0.055;
        if (!a.step && a.t > 0.5) {
          a.step = true;
          this.sfx.step();
        }
        if (a.t >= 1) {
          this.pos.copy(a.to);
          const gx = Math.round(this.pos.x / CELL + (this.maze.w - 1) / 2);
          const gy = Math.round(this.pos.z / CELL + (this.maze.w - 1) / 2);
          this.action = null;
          this.enterCell(gx, gy);
        }
      } else if (a.type === "turn") {
        const e = easeOutCubic(Math.min(a.t, 1));
        this.yaw = a.from + (a.to - a.from) * e;
        this.roll = Math.sin(Math.min(a.t, 1) * Math.PI) * 0.055 * a.sign;
        if (a.t >= 1) {
          this.yaw = a.to;
          this.action = null;
        }
      } else {
        if (a.t >= 1) this.action = null;
      }
    } else {
      this.bob *= Math.max(0, 1 - dt * 10);
      this.roll *= Math.max(0, 1 - dt * 8);
    }

    // hold-to-act (only when idle)
    if (!this.action && this.state === "playing") {
      const sector = this.sectorOf(this.yaw);
      const cardinal = sector % 2 === 0;
      const tryKeys: Array<[KeyTrack, () => boolean]> = [
        [this.keys.w, () => (cardinal ? this.tryMove(1) : false)],
        [this.keys.s, () => (cardinal ? this.tryMove(-1) : false)],
        [this.keys.a, () => this.tryTurn(1)],
        [this.keys.d, () => this.tryTurn(-1)],
      ];
      for (const [k, fn] of tryKeys) {
        if (k.down) {
          k.held += dt;
          if (k.held >= HOLD_TIME) {
            if (fn()) {
              k.held = 0;
              break; // one action per frame
            } else k.held = HOLD_TIME; // blocked: keep at full (ring stays red)
          }
        }
      }
    }

    // mood lerp
    const m = MOODS[this.biome];
    const b = BIOMES[this.biome];
    const k = 1 - Math.exp(-dt * 2.4);
    this.mood.fog.lerp(new THREE.Color(m.fog), k);
    this.mood.near += (m.near - this.mood.near) * k;
    this.mood.far += (m.far - this.mood.far) * k;
    this.mood.hemiSky.lerp(new THREE.Color(m.hemiSky), k);
    this.mood.hemiGround.lerp(new THREE.Color(m.hemiGround), k);
    this.mood.hemiI += (m.hemiI - this.mood.hemiI) * k;
    this.mood.sunI += (m.sunI - this.mood.sunI) * k;
    this.mood.sunColor.lerp(new THREE.Color(m.sunColor), k);
    this.mood.lamp.lerp(new THREE.Color(b.lamp), k);
    this.mood.lampI += (b.lampIntensity - this.mood.lampI) * k;
    this.mood.openness += (m.openness - this.mood.openness) * k;

    this.trauma = Math.max(0, this.trauma - dt * 2.2);
  }

  private render(dt: number) {
    // camera placement
    const eye = 1.62;
    let bumpX = 0, bumpZ = 0;
    if (this.action?.type === "bump") {
      const s = Math.sin(Math.min(this.action.t, 1) * Math.PI) * 0.42;
      bumpX = this.action.dir.x * s;
      bumpZ = this.action.dir.z * s;
    }
    const sh = this.state === "playing" ? this.trauma * this.trauma : 0;
    const camX = this.pos.x + bumpX + (Math.random() - 0.5) * 0.12 * sh;
    const camY = eye + this.bob + (Math.random() - 0.5) * 0.08 * sh;
    const camZ = this.pos.z + bumpZ + (Math.random() - 0.5) * 0.12 * sh;
    this.camera.position.set(camX, camY, camZ);
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * 0.02 * sh, this.yaw, this.roll + (Math.random() - 0.5) * 0.02 * sh);

    // apply mood
    const fog = this.world.scene.fog as THREE.Fog;
    fog.color.copy(this.mood.fog);
    fog.near = this.mood.near;
    fog.far = this.mood.far;
    this.hemi.color.copy(this.mood.hemiSky);
    this.hemi.groundColor.copy(this.mood.hemiGround);
    this.hemi.intensity = this.mood.hemiI;
    this.sun.intensity = this.mood.sunI;
    this.sun.color.copy(this.mood.sunColor);
    this.lamp.color.copy(this.mood.lamp);
    this.lamp.intensity = this.mood.lampI + Math.sin(this.time * 9) * 0.25;
    this.lamp.position.set(camX, camY - 0.15, camZ);

    this.world.update(this.camera.position, this.biome, dt, this.time);
    this.renderer.render(this.world.scene, this.camera);

    // continuous HUD channels
    if (this.view) {
      const deg = (this.yaw * 180) / Math.PI;
      this.view.setNeedle(deg);
      this.view.setSector(this.sectorOf(this.yaw));
      // ring: strongest held key
      let prog = 0;
      let activeKey: "w" | "a" | "s" | "d" | null = null;
      (["w", "a", "s", "d"] as const).forEach((kk) => {
        const tr = this.keys[kk];
        if (tr.down && tr.held > prog) {
          prog = tr.held;
          activeKey = kk;
        }
        const sector = this.sectorOf(this.yaw);
        const blocked = (kk === "w" || kk === "s") && tr.down && sector % 2 !== 0;
        this.view!.setKeyFill(kk, Math.min(tr.held / HOLD_TIME, 1), tr.down, blocked);
      });
      const sector = this.sectorOf(this.yaw);
      const valid = activeKey === "a" || activeKey === "d" || sector % 2 === 0;
      this.view.setRing(Math.min(prog / HOLD_TIME, 1), valid, !!this.action);
    }

    // minimap
    if (this.mapOpen && this.mapCanvas && this.time - this.lastMapDraw > 0.12 && this.state !== "menu") {
      this.lastMapDraw = this.time;
      this.drawMap();
    }
  }

  // ---------- minimap ----------
  private drawMap() {
    const c = this.mapCanvas!;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const P = 10; // px per cell
    const W = this.maze.w;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0c0e14";
    ctx.fillRect(0, 0, c.width, c.height);

    const nearPlayer = (x: number, y: number) => Math.max(Math.abs(x - this.cellX), Math.abs(y - this.cellY)) <= 2;

    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const walk = !!this.maze.grid[i];
        if (walk) {
          if (!this.seen.has(i)) continue;
          const b = this.biomeAt(x, y);
          const isRoom = x % 2 === 1 && y % 2 === 1;
          const col = BIOMES[b].map;
          ctx.globalAlpha = nearPlayer(x, y) || (isRoom && this.visitedRooms.has(i)) || !isRoom ? 0.95 : 0.45;
          ctx.fillStyle = col;
          ctx.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
          if (!isRoom) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
          }
          ctx.globalAlpha = 1;
        } else {
          // wall: draw if adjacent to any seen walkable cell → clear impassable boundary
          let adj = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < W && ny < W && this.seen.has(ny * W + nx) && this.maze.grid[ny * W + nx]) {
              adj = true;
              break;
            }
          }
          if (!adj && !nearPlayer(x, y)) continue;
          ctx.fillStyle = "#232833";
          ctx.fillRect(x * P, y * P, P, P);
          ctx.fillStyle = "#39414f";
          ctx.fillRect(x * P, y * P, P, 2);
          ctx.fillRect(x * P, y * P, 2, P);
          ctx.fillStyle = "#12151c";
          ctx.fillRect(x * P + P - 2, y * P, 2, P);
          ctx.fillRect(x * P, y * P + P - 2, P, 2);
        }
      }
    }

    // player
    const px = (this.pos.x / CELL + (W - 1) / 2) * P + P / 2;
    const py = (this.pos.z / CELL + (W - 1) / 2) * P + P / 2;
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    const ang = Math.atan2(fwdZ, fwdX);
    // vision cone
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(255,217,138,0.2)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 20, -0.5, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd98a";
    ctx.beginPath();
    ctx.moveTo(6.5, 0);
    ctx.lineTo(-4, 4.2);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-4, -4.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#ffd98a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.cellX * P + 0.5, this.cellY * P + 0.5, P - 1, P - 1);

    // north marker
    ctx.fillStyle = "#e0a44a";
    ctx.font = "bold 11px 'Noto Sans SC'";
    ctx.fillText("N", 4, 12);
    ctx.strokeStyle = "#e0a44a";
    ctx.beginPath();
    ctx.moveTo(18, 9);
    ctx.lineTo(18, 3);
    ctx.moveTo(16, 5);
    ctx.lineTo(18, 3);
    ctx.lineTo(20, 5);
    ctx.stroke();
  }

  // ---------- snapshot ----------
  private pushSnap(force: boolean) {
    if (!this.view) return;
    const snap: Snapshot = {
      state: this.state,
      biome: this.biome,
      sector: this.sectorOf(this.yaw),
      cardinal: this.sectorOf(this.yaw) % 2 === 0,
      mapOpen: this.mapOpen,
      muted: this.sfx.muted,
      discovered: [...this.discovered],
      visited: this.visitedRooms.size,
      totalRooms: this.maze.rooms,
      allFound: this.allFound,
      finaleDismissed: this.finaleDismissed,
      elapsed: Math.floor(this.elapsed),
    };
    const s = JSON.stringify(snap);
    if (force || s !== this.lastSnap) {
      this.lastSnap = s;
      this.view.setSnap(snap);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.dispose();
  }
}
