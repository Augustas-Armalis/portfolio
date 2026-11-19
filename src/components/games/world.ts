// Terrain generation, the edit store and the chunk mesher. Pure data, no DOM
// and no three.js, so it can be exercised from node.

import {
  AIR, ATLAS_COLS, ATLAS_ROWS, BLOCKS, GLASS, IS_OPAQUE, LEAVES, MOSS, SAND, SLATE, SOIL, TRUNK, WATER,
  isValidBlock,
} from "./blockTypes";
import { Simplex, hash2 } from "./noise";

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 20;

/** Numeric map key for a chunk coordinate. */
export function chunkKey(cx: number, cz: number): number {
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Index of a block inside a chunk's data array. */
export function blockIndex(lx: number, y: number, lz: number): number {
  return lx + (lz << 4) + (y << 8);
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

const TREE_REACH = 2;
const GEN_W = CHUNK + TREE_REACH * 2;

export class Terrain {
  private readonly land: Simplex;
  private readonly rock: Simplex;

  constructor(readonly seed: number) {
    this.land = new Simplex(seed);
    this.rock = new Simplex(seed ^ 0x5bd1e995);
  }

  /** Y of the topmost ground block in a column. */
  height(x: number, z: number): number {
    const n = this.land;
    const continent = n.fbm2(x / 190, z / 190, 3);
    const hills = n.fbm2(x / 64 + 300, z / 64 - 300, 3);
    const detail = n.noise2(x / 17 - 90, z / 17 + 90);
    let h = SEA + 3 + continent * 13 + hills * (4 + 3 * (continent + 1)) + detail * 1.3;
    // Keep a patch of dry land around the origin so the spawn is never at sea.
    const d = Math.hypot(x, z);
    if (d < 44) {
      const t = 1 - d / 44;
      const s = t * t * (3 - 2 * t);
      const floor = SEA + 4;
      if (h < floor) h += (floor - h) * s;
    }
    return Math.max(4, Math.min(HEIGHT - 14, Math.floor(h)));
  }

  private isCave(x: number, y: number, z: number): boolean {
    return this.rock.noise3(x / 23, y / 14, z / 23) > 0.6;
  }

  private hasTree(x: number, z: number, h: number): boolean {
    // No trees on the beach, and a small clearing around the spawn.
    if (h < SEA + 2 || x * x + z * z < 30) return false;
    const forest = this.land.noise2(x / 110 + 700, z / 110 - 700) * 0.5 + 0.5;
    if (hash2(x, z, this.seed) >= 0.003 + 0.028 * forest * forest) return false;
    return !(h > SEA + 4 && this.isCave(x, h, z));
  }

  /** Generates the untouched blocks of one chunk. */
  generate(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;

    const heights = new Int16Array(GEN_W * GEN_W);
    for (let pz = 0; pz < GEN_W; pz++) {
      for (let px = 0; px < GEN_W; px++) {
        heights[px + pz * GEN_W] = this.height(x0 + px - TREE_REACH, z0 + pz - TREE_REACH);
      }
    }

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const h = heights[lx + TREE_REACH + (lz + TREE_REACH) * GEN_W];
        const wx = x0 + lx;
        const wz = z0 + lz;
        const beach = h <= SEA + 1;
        // Caves may break the surface only well above the waterline.
        const openCaves = h > SEA + 4;
        for (let y = 0; y <= h; y++) {
          let id = y === h ? (beach ? SAND : MOSS) : y >= h - 3 ? (beach ? SAND : SOIL) : SLATE;
          if (y >= 2 && (openCaves || y < h - 4) && this.isCave(wx, y, wz)) id = AIR;
          data[blockIndex(lx, y, lz)] = id;
        }
        for (let y = h + 1; y <= SEA; y++) data[blockIndex(lx, y, lz)] = WATER;
      }
    }

    // Trees, including the parts of trees rooted just outside this chunk.
    const put = (wx: number, y: number, wz: number, id: number, onlyAir: boolean) => {
      const lx = wx - x0;
      const lz = wz - z0;
      if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
      const i = blockIndex(lx, y, lz);
      if (onlyAir && data[i] !== AIR) return;
      data[i] = id;
    };
    for (let pz = 0; pz < GEN_W; pz++) {
      for (let px = 0; px < GEN_W; px++) {
        const h = heights[px + pz * GEN_W];
        const wx = x0 + px - TREE_REACH;
        const wz = z0 + pz - TREE_REACH;
        if (!this.hasTree(wx, wz, h)) continue;
        const tall = 4 + Math.floor(hash2(wx, wz, this.seed + 17) * 3);
        const top = h + tall;
        for (let y = top - 2; y <= top + 1; y++) {
          const r = y <= top - 1 ? 2 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              const corner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (corner && (y === top + 1 || hash2(wx + dx * 31 + y, wz + dz * 17, this.seed + 5) < 0.6)) continue;
              put(wx + dx, y, wz + dz, LEAVES, true);
            }
          }
        }
        for (let y = h + 1; y <= top; y++) put(wx, y, wz, TRUNK, false);
      }
    }
    return data;
  }
}

// ---------------------------------------------------------------------------
// Edits: only the blocks the player changed, grouped by chunk
// ---------------------------------------------------------------------------

export class Edits {
  private readonly chunks = new Map<number, Map<number, number>>();

  set(x: number, y: number, z: number, id: number): void {
    const key = chunkKey(x >> 4, z >> 4);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Map();
      this.chunks.set(key, chunk);
    }
    chunk.set(blockIndex(x & 15, y, z & 15), id);
  }

  /** Writes the saved edits of one chunk over freshly generated data. */
  apply(cx: number, cz: number, data: Uint8Array): void {
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return;
    chunk.forEach((id, index) => {
      data[index] = id;
    });
  }

  clear(): void {
    this.chunks.clear();
  }

  /** Serialises to a plain map from "x,y,z" to block id. */
  toJSON(): Record<string, number> {
    const out: Record<string, number> = {};
    this.chunks.forEach((chunk, key) => {
      const cx = Math.floor(key / 65536) - 32768;
      const cz = (key % 65536) - 32768;
      chunk.forEach((id, index) => {
        const x = cx * CHUNK + (index & 15);
        const z = cz * CHUNK + ((index >> 4) & 15);
        out[`${x},${index >> 8},${z}`] = id;
      });
    });
    return out;
  }

  /** Loads a map produced by toJSON, skipping anything malformed. */
  load(raw: unknown): void {
    this.chunks.clear();
    if (!raw || typeof raw !== "object") return;
    for (const [key, id] of Object.entries(raw as Record<string, unknown>)) {
      const parts = key.split(",");
      if (parts.length !== 3 || !isValidBlock(id)) continue;
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) continue;
      if (y < 0 || y >= HEIGHT || Math.abs(x) > 500000 || Math.abs(z) > 500000) continue;
      this.set(x, y, z, id);
    }
  }
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshData {
  /** Solid and cut-out blocks. */
  opaque: MeshData | null;
  /** Translucent water, drawn afterwards. */
  water: MeshData | null;
}

// The chunk is copied into a buffer padded by one block on every side, so the
// mesher can read neighbours (for face culling and ambient occlusion) with
// plain index offsets.
const PW = CHUNK + 2;
const PA = PW * PW;
const PH = HEIGHT + 2;
const PADDED_SIZE = PA * PH;

function paddedDelta(dx: number, dy: number, dz: number): number {
  return dx + dz * PW + dy * PA;
}

type Vec3 = readonly [number, number, number];

interface Face {
  normal: Vec3;
  /** Corners counter-clockwise seen from outside; matches CORNER_UV. */
  corners: readonly Vec3[];
  /** Linear light multiplier: brightness plus a warm sun / cool shade tint. */
  light: Vec3;
  kind: "top" | "side" | "bottom";
}

const FACES: readonly Face[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], light: [0.84, 0.8, 0.72], kind: "side" },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], light: [0.56, 0.58, 0.65], kind: "side" },
  { normal: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], light: [1, 0.98, 0.92], kind: "top" },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], light: [0.42, 0.43, 0.48], kind: "bottom" },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], light: [0.72, 0.71, 0.68], kind: "side" },
  { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], light: [0.63, 0.64, 0.68], kind: "side" },
];

const CORNER_UV: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.5, 0.68, 0.84, 1];
const LAMP_LIGHT: Vec3 = [1.3, 1.16, 0.92];
const WATER_SURFACE = 0.875;
const UV_INSET = 0.002;

// Per face: index offset to the neighbour, and per corner the three offsets
// (two edge neighbours and the diagonal) that can occlude that corner.
const FACE_DELTA = new Int32Array(6);
const AO_DELTA = new Int32Array(6 * 4 * 3);
for (let f = 0; f < 6; f++) {
  const { normal, corners } = FACES[f];
  FACE_DELTA[f] = paddedDelta(normal[0], normal[1], normal[2]);
  const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2;
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  for (let c = 0; c < 4; c++) {
    const a: [number, number, number] = [normal[0], normal[1], normal[2]];
    const b: [number, number, number] = [normal[0], normal[1], normal[2]];
    const d: [number, number, number] = [normal[0], normal[1], normal[2]];
    const du = corners[c][u] ? 1 : -1;
    const dv = corners[c][v] ? 1 : -1;
    a[u] += du;
    b[v] += dv;
    d[u] += du;
    d[v] += dv;
    const o = (f * 4 + c) * 3;
    AO_DELTA[o] = paddedDelta(a[0], a[1], a[2]);
    AO_DELTA[o + 1] = paddedDelta(b[0], b[1], b[2]);
    AO_DELTA[o + 2] = paddedDelta(d[0], d[1], d[2]);
  }
}

let scratch: Uint8Array | null = null;

/**
 * Copies a chunk and the one-block border of its eight neighbours into the
 * shared padded buffer. Missing neighbours read as air; below the world is
 * solid, above it is air.
 */
export function buildPadded(
  getChunk: (cx: number, cz: number) => Uint8Array | undefined,
  cx: number,
  cz: number,
): Uint8Array {
  if (!scratch) scratch = new Uint8Array(PADDED_SIZE);
  const out = scratch;
  out.fill(SLATE, 0, PA);
  out.fill(AIR, PA);
  for (let pz = 0; pz < PW; pz++) {
    const z = pz - 1;
    const ncz = cz + (z < 0 ? -1 : z >= CHUNK ? 1 : 0);
    const lz = z & 15;
    for (let px = 0; px < PW; px++) {
      const x = px - 1;
      const ncx = cx + (x < 0 ? -1 : x >= CHUNK ? 1 : 0);
      const src = getChunk(ncx, ncz);
      if (!src) continue;
      let from = (x & 15) + (lz << 4);
      let to = px + pz * PW + PA;
      for (let y = 0; y < HEIGHT; y++) {
        out[to] = src[from];
        from += 256;
        to += PA;
      }
    }
  }
  return out;
}

class Builder {
  positions: number[] = [];
  uvs: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  vertices = 0;

  finish(): MeshData | null {
    if (this.vertices === 0) return null;
    return {
      positions: new Float32Array(this.positions),
      uvs: new Float32Array(this.uvs),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    };
  }
}

const aoScratch = [3, 3, 3, 3];

/** Turns a padded chunk buffer into vertex data, in chunk-local coordinates. */
export function meshPadded(P: Uint8Array): ChunkMeshData {
  const opaque = new Builder();
  const water = new Builder();

  for (let y = 0; y < HEIGHT; y++) {
    for (let z = 0; z < CHUNK; z++) {
      let i = 1 + (z + 1) * PW + (y + 1) * PA;
      for (let x = 0; x < CHUNK; x++, i++) {
        const id = P[i];
        if (id === AIR) continue;
        const block = BLOCKS[id];
        const isWater = id === WATER;
        const out = isWater ? water : opaque;
        // A water block with no water above sits slightly below the block top.
        const topY = isWater && P[i + PA] !== WATER ? WATER_SURFACE : 1;

        for (let f = 0; f < 6; f++) {
          const neighbour = P[i + FACE_DELTA[f]];
          if (IS_OPAQUE[neighbour]) continue;
          if (neighbour === id && (isWater || id === GLASS)) continue;

          const face = FACES[f];
          const tile = face.kind === "top" ? block.top : face.kind === "bottom" ? block.bottom : block.side;
          const tu = tile % ATLAS_COLS;
          const tv = Math.floor(tile / ATLAS_COLS);
          const flat = isWater || block.emissive;

          for (let c = 0; c < 4; c++) {
            let ao = 3;
            if (!flat) {
              const o = (f * 4 + c) * 3;
              const s1 = IS_OPAQUE[P[i + AO_DELTA[o]]];
              const s2 = IS_OPAQUE[P[i + AO_DELTA[o + 1]]];
              const cr = IS_OPAQUE[P[i + AO_DELTA[o + 2]]];
              ao = s1 && s2 ? 0 : 3 - s1 - s2 - cr;
            }
            aoScratch[c] = ao;
            const corner = face.corners[c];
            out.positions.push(x + corner[0], y + corner[1] * topY, z + corner[2]);
            const uv = CORNER_UV[c];
            out.uvs.push(
              (tu + (uv[0] ? 1 - UV_INSET : UV_INSET)) / ATLAS_COLS,
              1 - (tv + (uv[1] ? UV_INSET : 1 - UV_INSET)) / ATLAS_ROWS,
            );
            if (block.emissive) {
              const k = 0.8 + 0.2 * face.light[1];
              out.colors.push(LAMP_LIGHT[0] * k, LAMP_LIGHT[1] * k, LAMP_LIGHT[2] * k);
            } else {
              const k = AO_CURVE[ao];
              out.colors.push(face.light[0] * k, face.light[1] * k, face.light[2] * k);
            }
          }

          // Split the quad along the diagonal that keeps the AO gradient smooth.
          const v = out.vertices;
          if (aoScratch[0] + aoScratch[2] < aoScratch[1] + aoScratch[3]) {
            out.indices.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
          } else {
            out.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
          }
          out.vertices += 4;
        }
      }
    }
  }

  return { opaque: opaque.finish(), water: water.finish() };
}
