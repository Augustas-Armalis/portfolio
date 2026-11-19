// The imperative game: renderer, chunk streaming, player physics, input and
// saving. Blocks.tsx owns the DOM HUD and talks to this through a few methods.

import {
  BackSide, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, DoubleSide, EdgesGeometry, Fog,
  LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, NearestFilter, PerspectiveCamera, SRGBColorSpace, Scene,
  SphereGeometry, WebGLRenderer,
} from "three";
import { AIR, IS_SOLID, PLACEABLE, SLATE, WATER } from "./blockTypes";
import {
  CHUNK, Edits, HEIGHT, SEA, Terrain, blockIndex, buildPadded, chunkKey, meshPadded, type MeshData,
} from "./world";

export const STORAGE_KEY = "augustas-os:blocks";
export const SLOT_COUNT = PLACEABLE.length;

const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const REACH = 6;
const EPS = 0.001;

const WALK_SPEED = 4.3;
const SPRINT_SPEED = 6.4;
const SWIM_SPEED = 2.6;
const GRAVITY = 26;
const JUMP_SPEED = 8.4;
const MAX_FALL = 50;
const ACTION_INTERVAL = 0.22;

const MOUSE_SENSITIVITY = 0.0022;
const TOUCH_SENSITIVITY = 0.0052;
const MAX_PITCH = Math.PI / 2 - 0.01;

/** Milliseconds of chunk generation and meshing allowed per frame. */
const STREAM_BUDGET_MS = 5;
const SAVE_DEBOUNCE_MS = 600;

const SKY_ZENITH = 0x7c9fba;
const SKY_HORIZON = 0xe2dccb;
const DEEP_WATER = 0x2a5d66;

export interface GameCallbacks {
  /** The game started or stopped taking input (pointer locked / released). */
  onPlayingChange(playing: boolean): void;
  /** The hotbar selection changed from inside the game (wheel, number keys, load). */
  onSelect(slot: number): void;
  /** The camera went under or came out of water. */
  onSubmerged(submerged: boolean): void;
}

export interface GameOptions {
  /** Touch controls: no pointer lock, input arrives through the methods below. */
  touch: boolean;
  /** Radius, in chunks, of the meshed world around the player. */
  renderDistance: number;
}

interface ChunkRecord {
  cx: number;
  cz: number;
  data: Uint8Array;
  opaque: Mesh | null;
  water: Mesh | null;
  meshed: boolean;
}

interface Target {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

interface SavedPlayer {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

interface SaveFile {
  v: 1;
  seed: number;
  edits: Record<string, number>;
  player: SavedPlayer;
  slot: number;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function readSave(): Partial<SaveFile> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Partial<SaveFile>) : null;
  } catch {
    return null;
  }
}

export class BlocksGame {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: GameCallbacks;
  private readonly touch: boolean;
  private readonly renderDistance: number;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly fog: Fog;
  private readonly atlas: CanvasTexture;
  private readonly opaqueMaterial: MeshBasicMaterial;
  private readonly waterMaterial: MeshBasicMaterial;
  private readonly sky: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly outline: LineSegments<EdgesGeometry, LineBasicMaterial>;
  private readonly resizeObserver: ResizeObserver;

  private terrain: Terrain;
  private seed: number;
  private readonly edits = new Edits();
  private readonly chunks = new Map<number, ChunkRecord>();
  private readonly offsets: readonly (readonly [number, number])[];
  private lastChunk: ChunkRecord | null = null;
  private streamDirty = true;
  private centerX = Number.NaN;
  private centerZ = Number.NaN;

  // Player state. Position is the centre of the feet.
  private px = 0.5;
  private py = HEIGHT;
  private pz = 0.5;
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private yaw = 0;
  private pitch = 0;
  private onGround = false;
  private slot = 0;
  private target: Target | null = null;
  private submerged = false;

  // Input state.
  private readonly keys = new Set<string>();
  private stickX = 0;
  private stickY = 0;
  private jumpHeld = false;
  private breakHeld = false;
  private placeHeld = false;
  // A press is latched until the next simulation step, so a tap shorter than
  // one frame still counts.
  private jumpQueued = false;
  private breakQueued = false;
  private placeQueued = false;
  private actionCooldown = 0;
  private wheelAccum = 0;

  private playing = false;
  // The browser would not give the pointer lock (an embedded frame, a privacy setting, an automated browser):
  // the game still plays, with drag to look and a plain click to break or place.
  private free = false;
  private everLocked = false;
  private freeDrag: { button: number; place: boolean; moved: number } | null = null;
  private disposed = false;
  private raf = 0;
  private lastTime = 0;
  private needsRender = true;
  private saveTimer: number | null = null;
  private sinceAutosave = 0;

  constructor(container: HTMLElement, atlasCanvas: HTMLCanvasElement, options: GameOptions, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.touch = options.touch;
    this.renderDistance = Math.max(2, Math.min(8, Math.round(options.renderDistance)));

    // The game owns its canvas, so a remount never reuses a lost GL context.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
    this.canvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(canvas);

    const reach = this.renderDistance * CHUNK;
    this.camera = new PerspectiveCamera(70, 1, 0.08, reach + 96);
    this.camera.rotation.order = "YXZ";
    this.fog = new Fog(SKY_HORIZON, reach * 0.55, reach - 6);
    this.scene.fog = this.fog;

    this.atlas = new CanvasTexture(atlasCanvas);
    this.atlas.magFilter = NearestFilter;
    this.atlas.minFilter = NearestFilter;
    this.atlas.generateMipmaps = false;
    this.atlas.colorSpace = SRGBColorSpace;
    this.opaqueMaterial = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
    this.waterMaterial = new MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      side: DoubleSide,
    });

    this.sky = this.createSky();
    this.scene.add(this.sky);

    const box = new BoxGeometry(1.004, 1.004, 1.004);
    this.outline = new LineSegments(
      new EdgesGeometry(box),
      new LineBasicMaterial({ color: 0x14181a, transparent: true, opacity: 0.7, fog: false }),
    );
    box.dispose();
    this.outline.visible = false;
    this.outline.renderOrder = 2;
    this.scene.add(this.outline);

    // Chunk offsets within the render distance, nearest first.
    const offsets: [number, number][] = [];
    const r = this.renderDistance;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz <= (r + 0.5) * (r + 0.5)) offsets.push([dx, dz]);
      }
    }
    offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.offsets = offsets;

    // Load the saved world, or start a new one at the origin.
    const save = readSave();
    this.seed = save && isFiniteNumber(save.seed) ? Math.floor(save.seed) : randomSeed();
    this.terrain = new Terrain(this.seed);
    if (save) {
      this.edits.load(save.edits);
      if (isFiniteNumber(save.slot)) this.slot = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(save.slot)));
    }
    const p = save?.player;
    if (p && isFiniteNumber(p.x) && isFiniteNumber(p.y) && isFiniteNumber(p.z) && p.y > -8 && p.y < HEIGHT + 64) {
      this.px = p.x;
      this.py = p.y;
      this.pz = p.z;
      this.yaw = isFiniteNumber(p.yaw) ? p.yaw : 0;
      this.pitch = isFiniteNumber(p.pitch) ? Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch)) : 0;
    } else {
      this.spawnAtOrigin();
    }
    this.syncView();

    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pagehide", this.onPageHide);
    canvas.addEventListener("mousedown", this.onMouseDown);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    callbacks.onSelect(this.slot);
    if (!document.hidden) this.start();
  }

  // -------------------------------------------------------------------------
  // Public API (used by the HUD)
  // -------------------------------------------------------------------------

  /** Start or resume. On desktop this asks for the pointer lock. */
  play(): void {
    if (this.disposed) return;
    if (this.touch) {
      this.setPlaying(true);
      return;
    }
    if (this.free) {
      this.setPlaying(true);
      return;
    }
    // A refusal right after Esc is the browser's cool-down: stay paused. A refusal when the lock has never
    // worked means it isn't available here, so fall back to drag-to-look.
    const refused = (): void => {
      if (this.disposed || this.everLocked || document.pointerLockElement === this.canvas) return;
      this.free = true;
      this.setPlaying(true);
    };
    try {
      // Returns a promise in current browsers; older ones return nothing.
      const result: unknown = this.canvas.requestPointerLock();
      if (result instanceof Promise) result.catch(refused);
    } catch {
      refused();
    }
  }

  pause(): void {
    if (this.touch || this.free) this.setPlaying(false);
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  select(slot: number): void {
    const next = ((Math.round(slot) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
    if (next === this.slot) return;
    this.slot = next;
    this.callbacks.onSelect(next);
    this.scheduleSave();
  }

  /** Virtual joystick: x is strafe right, y is screen-down (so up is forward). */
  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
  }

  /** Drag-to-look, in CSS pixels. */
  look(dx: number, dy: number): void {
    if (!this.playing) return;
    this.rotate(dx * TOUCH_SENSITIVITY, dy * TOUCH_SENSITIVITY);
  }

  setJump(held: boolean): void {
    this.jumpHeld = held;
    if (held) this.jumpQueued = true;
  }

  setBreaking(held: boolean): void {
    this.breakHeld = held;
    if (held) this.breakQueued = true;
  }

  setPlacing(held: boolean): void {
    this.placeHeld = held;
    if (held) this.placeQueued = true;
  }

  /** Erase the save and start over with a fresh seed. */
  newWorld(): void {
    if (this.disposed) return;
    this.chunks.forEach((chunk) => this.disposeChunkMeshes(chunk));
    this.chunks.clear();
    this.lastChunk = null;
    this.edits.clear();
    this.seed = randomSeed();
    this.terrain = new Terrain(this.seed);
    this.vx = this.vy = this.vz = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.slot = 0;
    this.target = null;
    this.centerX = Number.NaN;
    this.streamDirty = true;
    this.spawnAtOrigin();
    this.syncView();
    this.callbacks.onSelect(0);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
    this.saveNow();
    this.needsRender = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.saveNow();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.resizeObserver.disconnect();

    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pagehide", this.onPageHide);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();

    this.chunks.forEach((chunk) => this.disposeChunkMeshes(chunk));
    this.chunks.clear();
    this.lastChunk = null;
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.atlas.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private start(): void {
    cancelAnimationFrame(this.raf);
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (time: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;

    const streamed = this.streamChunks();
    if (this.playing) this.update(dt);
    // While paused the picture only changes when chunks arrive or on resize.
    if (this.playing || streamed || this.needsRender) {
      this.needsRender = false;
      this.sky.position.copy(this.camera.position);
      this.renderer.render(this.scene, this.camera);
    }
  };

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 70;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  private createSky(): Mesh<SphereGeometry, MeshBasicMaterial> {
    const geometry = new SphereGeometry(40, 24, 16);
    const position = geometry.getAttribute("position");
    const colors = new Float32Array(position.count * 3);
    const zenith = new Color(SKY_ZENITH);
    const horizon = new Color(SKY_HORIZON);
    const c = new Color();
    for (let i = 0; i < position.count; i++) {
      const up = Math.max(0, position.getY(i) / 40);
      c.copy(horizon).lerp(zenith, Math.pow(up, 0.55));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const material = new MeshBasicMaterial({
      vertexColors: true,
      side: BackSide,
      fog: false,
      depthTest: false,
      depthWrite: false,
    });
    const sky = new Mesh(geometry, material);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    return sky;
  }

  // -------------------------------------------------------------------------
  // World access
  // -------------------------------------------------------------------------

  private chunkAt(cx: number, cz: number): ChunkRecord | undefined {
    const last = this.lastChunk;
    if (last && last.cx === cx && last.cz === cz) return last;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (chunk) this.lastChunk = chunk;
    return chunk;
  }

  private ensureChunk(cx: number, cz: number): ChunkRecord {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const data = this.terrain.generate(cx, cz);
      this.edits.apply(cx, cz, data);
      chunk = { cx, cz, data, opaque: null, water: null, meshed: false };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** Block at a world position. Below the world is solid, unloaded space is air. */
  private getBlock(x: number, y: number, z: number): number {
    if (y < 0) return SLATE;
    if (y >= HEIGHT) return AIR;
    const chunk = this.chunkAt(x >> 4, z >> 4);
    return chunk ? chunk.data[blockIndex(x & 15, y, z & 15)] : AIR;
  }

  private setBlock(x: number, y: number, z: number, id: number): void {
    if (y < 0 || y >= HEIGHT) return;
    const cx = x >> 4;
    const cz = z >> 4;
    const chunk = this.chunkAt(cx, cz);
    if (!chunk) return;
    const lx = x & 15;
    const lz = z & 15;
    chunk.data[blockIndex(lx, y, lz)] = id;
    this.edits.set(x, y, z, id);
    // Remesh this chunk and any neighbour whose border (or AO) it touches.
    for (let dz = -1; dz <= 1; dz++) {
      if ((dz < 0 && lz !== 0) || (dz > 0 && lz !== CHUNK - 1)) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx < 0 && lx !== 0) || (dx > 0 && lx !== CHUNK - 1)) continue;
        const near = this.chunkAt(cx + dx, cz + dz);
        if (near && near.meshed) this.meshChunk(near);
      }
    }
    this.needsRender = true;
    this.scheduleSave();
  }

  // -------------------------------------------------------------------------
  // Chunk streaming and meshing
  // -------------------------------------------------------------------------

  private readonly chunkData = (cx: number, cz: number): Uint8Array | undefined => this.chunkAt(cx, cz)?.data;

  /** Generates and meshes missing chunks near the player within a time budget. */
  private streamChunks(): boolean {
    const pcx = Math.floor(this.px) >> 4;
    const pcz = Math.floor(this.pz) >> 4;
    if (pcx !== this.centerX || pcz !== this.centerZ) {
      this.centerX = pcx;
      this.centerZ = pcz;
      this.streamDirty = true;
      this.unloadFarChunks(pcx, pcz);
    }
    if (!this.streamDirty) return false;

    const started = performance.now();
    let worked = false;
    for (const [dx, dz] of this.offsets) {
      const cx = pcx + dx;
      const cz = pcz + dz;
      const existing = this.chunkAt(cx, cz);
      if (existing && existing.meshed) continue;
      // Meshing needs all eight neighbours, for border faces and AO.
      for (let nz = -1; nz <= 1; nz++) {
        for (let nx = -1; nx <= 1; nx++) {
          if (this.chunks.has(chunkKey(cx + nx, cz + nz))) continue;
          this.ensureChunk(cx + nx, cz + nz);
          worked = true;
          if (performance.now() - started > STREAM_BUDGET_MS) return true;
        }
      }
      this.meshChunk(this.ensureChunk(cx, cz));
      worked = true;
      if (performance.now() - started > STREAM_BUDGET_MS) return true;
    }
    this.streamDirty = false;
    return worked;
  }

  private unloadFarChunks(pcx: number, pcz: number): void {
    const limit = (this.renderDistance + 2.5) * (this.renderDistance + 2.5);
    this.chunks.forEach((chunk, key) => {
      const dx = chunk.cx - pcx;
      const dz = chunk.cz - pcz;
      if (dx * dx + dz * dz <= limit) return;
      this.disposeChunkMeshes(chunk);
      this.chunks.delete(key);
    });
    this.lastChunk = null;
  }

  private meshChunk(chunk: ChunkRecord): void {
    this.disposeChunkMeshes(chunk);
    const meshed = meshPadded(buildPadded(this.chunkData, chunk.cx, chunk.cz));
    if (meshed.opaque) chunk.opaque = this.createMesh(meshed.opaque, this.opaqueMaterial, chunk, 0);
    if (meshed.water) chunk.water = this.createMesh(meshed.water, this.waterMaterial, chunk, 1);
    chunk.meshed = true;
  }

  private createMesh(data: MeshData, material: MeshBasicMaterial, chunk: ChunkRecord, order: number): Mesh {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("uv", new BufferAttribute(data.uvs, 2));
    geometry.setAttribute("color", new BufferAttribute(data.colors, 3));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = order;
    this.scene.add(mesh);
    return mesh;
  }

  private disposeChunkMeshes(chunk: ChunkRecord): void {
    for (const mesh of [chunk.opaque, chunk.water]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    chunk.opaque = null;
    chunk.water = null;
    chunk.meshed = false;
  }

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------

  private spawnAtOrigin(): void {
    const chunk = this.ensureChunk(0, 0);
    let y = HEIGHT - 1;
    while (y > 0 && !IS_SOLID[chunk.data[blockIndex(0, y, 0)]]) y--;
    this.px = 0.5;
    this.py = y + 1 + EPS;
    this.pz = 0.5;
    this.vx = this.vy = this.vz = 0;
  }

  private collides(): boolean {
    const x0 = Math.floor(this.px - PLAYER_HALF);
    const x1 = Math.floor(this.px + PLAYER_HALF);
    const y0 = Math.floor(this.py);
    const y1 = Math.floor(this.py + PLAYER_HEIGHT);
    const z0 = Math.floor(this.pz - PLAYER_HALF);
    const z1 = Math.floor(this.pz + PLAYER_HALF);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (IS_SOLID[this.getBlock(x, y, z)]) return true;
        }
      }
    }
    return false;
  }

  /** Moves along one axis in small steps, stopping flush against solid blocks. */
  private moveAxis(axis: 0 | 1 | 2, distance: number): void {
    if (distance === 0) return;
    const steps = Math.ceil(Math.abs(distance) / 0.4);
    const step = distance / steps;
    for (let i = 0; i < steps; i++) {
      if (axis === 0) this.px += step;
      else if (axis === 1) this.py += step;
      else this.pz += step;
      if (!this.collides()) continue;
      if (axis === 0) {
        this.px = step > 0
          ? Math.floor(this.px + PLAYER_HALF) - PLAYER_HALF - EPS
          : Math.floor(this.px - PLAYER_HALF) + 1 + PLAYER_HALF + EPS;
        this.vx = 0;
      } else if (axis === 1) {
        if (step > 0) {
          this.py = Math.floor(this.py + PLAYER_HEIGHT) - PLAYER_HEIGHT - EPS;
        } else {
          this.py = Math.floor(this.py) + 1 + EPS;
          this.onGround = true;
        }
        this.vy = 0;
      } else {
        this.pz = step > 0
          ? Math.floor(this.pz + PLAYER_HALF) - PLAYER_HALF - EPS
          : Math.floor(this.pz - PLAYER_HALF) + 1 + PLAYER_HALF + EPS;
        this.vz = 0;
      }
      return;
    }
  }

  private update(dt: number): void {
    // Wait for the ground to exist before simulating.
    if (!this.chunkAt(Math.floor(this.px) >> 4, Math.floor(this.pz) >> 4)) return;

    // If the world changed around a saved position, rise out of solid blocks.
    let guard = HEIGHT + 4;
    while (guard-- > 0 && this.collides()) this.py = Math.floor(this.py) + 1 + EPS;

    const keys = this.keys;
    let forward = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    let strafe = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    forward -= this.stickY;
    strafe += this.stickX;
    const length = Math.hypot(forward, strafe);
    if (length > 1) {
      forward /= length;
      strafe /= length;
    }
    const jump = keys.has("Space") || this.jumpHeld || this.jumpQueued;
    this.jumpQueued = false;
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");

    const bx = Math.floor(this.px);
    const bz = Math.floor(this.pz);
    const inWater = this.getBlock(bx, Math.floor(this.py + 0.4), bz) === WATER;

    const speed = inWater ? SWIM_SPEED : sprint ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (-sin * forward + cos * strafe) * speed;
    const targetZ = (-cos * forward - sin * strafe) * speed;
    const grip = Math.min(1, dt * (this.onGround || inWater ? 14 : 5));
    this.vx += (targetX - this.vx) * grip;
    this.vz += (targetZ - this.vz) * grip;

    if (inWater) {
      // Sink slowly, swim up while jump is held.
      this.vy -= 7 * dt;
      this.vy *= 1 - Math.min(1, 3 * dt);
      if (jump) this.vy = Math.min(this.vy + 24 * dt, 3.4);
    } else {
      this.vy -= GRAVITY * dt;
      if (jump && this.onGround) this.vy = JUMP_SPEED;
    }
    if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;

    this.onGround = false;
    this.moveAxis(1, this.vy * dt);
    this.moveAxis(0, this.vx * dt);
    this.moveAxis(2, this.vz * dt);

    if (this.py < -16) this.spawnAtOrigin();

    this.syncView();

    this.actionCooldown -= dt;
    const ready = this.actionCooldown <= 0;
    if (this.breakQueued || (this.breakHeld && ready)) {
      this.breakTarget();
      this.actionCooldown = ACTION_INTERVAL;
    } else if (this.placeQueued || (this.placeHeld && ready)) {
      this.placeAtTarget();
      this.actionCooldown = ACTION_INTERVAL;
    }
    this.breakQueued = false;
    this.placeQueued = false;

    this.sinceAutosave += dt;
    if (this.sinceAutosave > 5) {
      this.sinceAutosave = 0;
      this.scheduleSave();
    }
  }

  private rotate(dYaw: number, dPitch: number): void {
    this.yaw -= dYaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - dPitch));
    // Keep yaw small so precision never degrades over a long session.
    if (this.yaw > Math.PI * 2 || this.yaw < -Math.PI * 2) this.yaw %= Math.PI * 2;
  }

  /** Pushes player state into the camera, the target outline and the water tint. */
  private syncView(): void {
    const ex = this.px;
    const ey = this.py + EYE_HEIGHT;
    const ez = this.pz;
    this.camera.position.set(ex, ey, ez);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    const cp = Math.cos(this.pitch);
    this.target = this.raycast(ex, ey, ez, -Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    if (this.target) {
      this.outline.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
      this.outline.visible = true;
    } else {
      this.outline.visible = false;
    }

    const submerged = this.getBlock(Math.floor(ex), Math.floor(ey), Math.floor(ez)) === WATER;
    if (submerged !== this.submerged) {
      this.submerged = submerged;
      const reach = this.renderDistance * CHUNK;
      this.fog.color.setHex(submerged ? DEEP_WATER : SKY_HORIZON);
      this.fog.near = submerged ? 1 : reach * 0.55;
      this.fog.far = submerged ? 24 : reach - 6;
      this.callbacks.onSubmerged(submerged);
    }
    this.needsRender = true;
  }

  /** Walks the voxel grid along a ray (DDA) to the first block that can be hit. */
  private raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): Target | null {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const deltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const deltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const deltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let nextX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * deltaX : Infinity;
    let nextY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * deltaY : Infinity;
    let nextZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * deltaZ : Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= REACH) {
      if (y >= 0 && y < HEIGHT) {
        const id = this.getBlock(x, y, z);
        if (id !== AIR && id !== WATER) return { x, y, z, nx, ny, nz };
      }
      if (nextX < nextY && nextX < nextZ) {
        t = nextX;
        nextX += deltaX;
        x += stepX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (nextY < nextZ) {
        t = nextY;
        nextY += deltaY;
        y += stepY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        t = nextZ;
        nextZ += deltaZ;
        z += stepZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
    }
    return null;
  }

  private breakTarget(): void {
    const t = this.target;
    // The bottom layer is the floor of the world and stays.
    if (!t || t.y === 0) return;
    // Below the waterline, water closes over the gap instead of leaving a dry hole.
    const floods =
      t.y <= SEA &&
      (this.getBlock(t.x, t.y + 1, t.z) === WATER ||
        this.getBlock(t.x + 1, t.y, t.z) === WATER ||
        this.getBlock(t.x - 1, t.y, t.z) === WATER ||
        this.getBlock(t.x, t.y, t.z + 1) === WATER ||
        this.getBlock(t.x, t.y, t.z - 1) === WATER);
    this.setBlock(t.x, t.y, t.z, floods ? WATER : AIR);
    this.syncView();
  }

  private placeAtTarget(): void {
    const t = this.target;
    if (!t || (t.nx === 0 && t.ny === 0 && t.nz === 0)) return;
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    if (y < 0 || y >= HEIGHT) return;
    const existing = this.getBlock(x, y, z);
    if (existing !== AIR && existing !== WATER) return;
    // Never place a block inside the player.
    const overlaps =
      this.px + PLAYER_HALF > x && this.px - PLAYER_HALF < x + 1 &&
      this.py + PLAYER_HEIGHT > y && this.py < y + 1 &&
      this.pz + PLAYER_HALF > z && this.pz - PLAYER_HALF < z + 1;
    if (overlaps) return;
    this.setBlock(x, y, z, PLACEABLE[this.slot]);
    this.syncView();
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private get locked(): boolean {
    return !this.touch && (this.free ? this.playing : document.pointerLockElement === this.canvas);
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing || this.disposed) return;
    this.playing = playing;
    if (!playing) {
      this.clearInput();
      this.saveNow();
    }
    this.lastTime = performance.now();
    this.needsRender = true;
    this.callbacks.onPlayingChange(playing);
  }

  private clearInput(): void {
    this.keys.clear();
    this.stickX = 0;
    this.stickY = 0;
    this.jumpHeld = false;
    this.breakHeld = false;
    this.placeHeld = false;
    this.jumpQueued = false;
    this.breakQueued = false;
    this.placeQueued = false;
    this.wheelAccum = 0;
  }

  private readonly onLockChange = (): void => {
    if (this.touch || this.free) return;
    if (document.pointerLockElement === this.canvas) this.everLocked = true;
    this.setPlaying(document.pointerLockElement === this.canvas);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.clearInput();
      this.saveNow();
    } else if (!this.disposed) {
      this.needsRender = true;
      this.start();
    }
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.breakHeld = false;
    this.placeHeld = false;
  };

  private readonly onPageHide = (): void => {
    this.saveNow();
  };

  // Keys only count while the pointer is locked, so typing elsewhere in the
  // desktop never moves the player.
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.locked || e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    if (this.free && code === "Escape") {
      this.setPlaying(false);
      return;
    }
    if (code.startsWith("Digit")) {
      const n = Number(code.slice(5));
      if (n >= 1 && n <= SLOT_COUNT) {
        this.select(n - 1);
        e.preventDefault();
      }
      return;
    }
    this.keys.add(code);
    if (code === "Space" || code.startsWith("Arrow")) e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    if (this.free) {
      // drag to look: only while a button is down
      if (!this.freeDrag) return;
      this.freeDrag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.rotate(-e.movementX * MOUSE_SENSITIVITY, -e.movementY * MOUSE_SENSITIVITY);
      return;
    }
    this.rotate(e.movementX * MOUSE_SENSITIVITY, e.movementY * MOUSE_SENSITIVITY);
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    if (this.free) {
      this.freeDrag = { button: e.button, place: e.button === 2 || e.ctrlKey || e.metaKey, moved: 0 };
      return;
    }
    if (e.button === 2 || (e.button === 0 && (e.ctrlKey || e.metaKey))) this.setPlacing(true);
    else if (e.button === 0) this.setBreaking(true);
  };

  private readonly onMouseUp = (): void => {
    if (this.touch) return;
    this.breakHeld = false;
    this.placeHeld = false;
    // drag-to-look: a press that didn't travel is a click on the block under the crosshair
    const d = this.freeDrag;
    this.freeDrag = null;
    if (!d || !this.locked || d.moved > 5) return;
    if (d.place) this.placeQueued = true;
    else if (d.button === 0) this.breakQueued = true;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    // Trackpads send many small deltas; step one slot per notch-worth.
    this.wheelAccum += e.deltaY;
    if (Math.abs(this.wheelAccum) < 40) return;
    this.select(this.slot + (this.wheelAccum > 0 ? 1 : -1));
    this.wheelAccum = 0;
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  private scheduleSave(): void {
    if (this.disposed) return;
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private saveNow(): void {
    if (this.disposed) return;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const round = (n: number) => Math.round(n * 1000) / 1000;
    const file: SaveFile = {
      v: 1,
      seed: this.seed,
      edits: this.edits.toJSON(),
      player: { x: round(this.px), y: round(this.py), z: round(this.pz), yaw: round(this.yaw), pitch: round(this.pitch) },
      slot: this.slot,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch {
      // Storage is full or blocked: the world simply is not persisted.
    }
  }
}
