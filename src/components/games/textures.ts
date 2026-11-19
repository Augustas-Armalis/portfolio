// Procedural pixel textures, painted at runtime into a small atlas canvas.
// Palette: a calm dusk meadow. Moss greens, warm clay, slate, sand, pale birch,
// deep teal water and an amber lamp.

import { ATLAS_COLS, ATLAS_ROWS, BLOCKS, MOSS, TILE_COUNT, TILE_PX, Tile, type TileId } from "./blockTypes";
import { mulberry32 } from "./noise";

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];
type Painter = (x: number, y: number, rnd: () => number) => RGBA;

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Nudge brightness by up to +-amount so flat areas read as brushed paint. */
function grain(c: RGB, amount: number, rnd: () => number, alpha = 255): RGBA {
  const k = 1 + (rnd() * 2 - 1) * amount;
  return [c[0] * k, c[1] * k, c[2] * k, alpha];
}

/** Pick from three tones: mostly the base, sometimes the shade or the light. */
function dab(shade: RGB, base: RGB, light: RGB, pShade: number, pLight: number, rnd: () => number): RGB {
  const r = rnd();
  return r < pShade ? shade : r > 1 - pLight ? light : base;
}

const C = {
  mossShade: hex("#5b7850"),
  moss: hex("#6f8c5c"),
  mossLight: hex("#87a06d"),
  soilShade: hex("#77594a"),
  soil: hex("#8a6a55"),
  soilLight: hex("#9b7c64"),
  pebble: hex("#a8937c"),
  slateShade: hex("#5b646d"),
  slate: hex("#6d7780"),
  slateLight: hex("#7e8890"),
  sandShade: hex("#c8b78f"),
  sand: hex("#d8c9a3"),
  sandLight: hex("#e4d8b6"),
  plankLine: hex("#b0a183"),
  plankShade: hex("#cbbd9f"),
  plank: hex("#dacfb4"),
  mortar: hex("#cabdab"),
  brickA: hex("#a9684f"),
  brickB: hex("#b97b5f"),
  brickC: hex("#9a5d49"),
  glassFrame: hex("#d5e4e3"),
  glassGlint: hex("#f3f8f6"),
  lampFrame: hex("#8c673b"),
  lampRib: hex("#dfa550"),
  lampEdge: hex("#efb85e"),
  lampCore: hex("#ffe9b3"),
  waterDeep: hex("#2c6670"),
  water: hex("#317079"),
  waterLight: hex("#44848b"),
  barkShade: hex("#62544a"),
  bark: hex("#7a6958"),
  barkLight: hex("#8b7a67"),
  ringA: hex("#b9a787"),
  ringB: hex("#a59271"),
  leafShade: hex("#4b6b54"),
  leaf: hex("#56795c"),
  leafLight: hex("#638662"),
  leafPale: hex("#7f9a6c"),
} as const;

const paintMoss: Painter = (_x, _y, rnd) => grain(dab(C.mossShade, C.moss, C.mossLight, 0.16, 0.13, rnd), 0.035, rnd);

const paintSoil: Painter = (_x, _y, rnd) => {
  const c = rnd() > 0.96 ? C.pebble : dab(C.soilShade, C.soil, C.soilLight, 0.2, 0.15, rnd);
  return grain(c, 0.04, rnd);
};

const PAINTERS: Record<TileId, Painter> = {
  [Tile.MossTop]: paintMoss,
  [Tile.Soil]: paintSoil,
  [Tile.MossSide]: (x, y, rnd) => {
    // A ragged fringe of moss hanging over the soil.
    const reach = y < 3 ? 1 : y === 3 ? 0.6 : y === 4 ? 0.25 : 0;
    const mossy = rnd() < reach;
    return mossy ? paintMoss(x, y, rnd) : paintSoil(x, y, rnd);
  },
  [Tile.Slate]: (x, y, rnd) => {
    // Layered stone: thin darker seams that step sideways every few pixels.
    const seam = (y + (x >> 3) * 2) % 5 === 0;
    const c = seam ? C.slateShade : dab(C.slateShade, C.slate, C.slateLight, 0.08, 0.16, rnd);
    return grain(c, 0.035, rnd);
  },
  [Tile.Sand]: (_x, _y, rnd) => grain(dab(C.sandShade, C.sand, C.sandLight, 0.12, 0.1, rnd), 0.025, rnd),
  [Tile.Plank]: (x, y, rnd) => {
    const row = y >> 2;
    if (y % 4 === 3) return grain(C.plankLine, 0.03, rnd);
    if (x === (row * 7 + 3) % 16) return grain(C.plankShade, 0.03, rnd);
    return grain(rnd() > 0.88 ? C.plankShade : C.plank, 0.025, rnd);
  },
  [Tile.Brick]: (x, y, rnd) => {
    const row = y >> 2;
    const bx = (x + (row % 2) * 4) % 16;
    if (y % 4 === 3 || bx % 8 === 7) return grain(C.mortar, 0.03, rnd);
    const pick = (row * 3 + (bx >> 3) * 5 + (row % 2)) % 3;
    const c = pick === 0 ? C.brickA : pick === 1 ? C.brickB : C.brickC;
    return grain(c, 0.05, rnd);
  },
  [Tile.Glass]: (x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return [...C.glassFrame, 255];
    // Two short glints, otherwise clear (cut out by the alpha test).
    const glint = (x + y === 7 && x >= 3 && x <= 4) || (x + y === 10 && x >= 3 && x <= 6);
    return glint ? [...C.glassGlint, 255] : [...C.glassFrame, 0];
  },
  [Tile.Lamp]: (x, y, rnd) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return grain(C.lampFrame, 0.04, rnd);
    if (y % 5 === 0) return grain(C.lampRib, 0.03, rnd);
    const d = Math.min(1, Math.hypot(x - 7.5, y - 7.5) / 9);
    return grain(mix(C.lampCore, C.lampEdge, d), 0.02, rnd);
  },
  [Tile.Water]: (x, y, rnd) => {
    const ripple = (x + y * 3) % 8 === 0 || rnd() > 0.95;
    const c = ripple ? C.waterLight : rnd() < 0.25 ? C.waterDeep : C.water;
    return grain(c, 0.03, rnd);
  },
  [Tile.TrunkSide]: (x, _y, rnd) => {
    const groove = x % 4 === 1 && rnd() > 0.15;
    const c = groove ? C.barkShade : rnd() > 0.86 ? C.barkLight : C.bark;
    return grain(c, 0.04, rnd);
  },
  [Tile.TrunkTop]: (x, y, rnd) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.6) return grain(C.barkShade, 0.04, rnd);
    return grain(Math.floor(d) % 2 === 0 ? C.ringA : C.ringB, 0.03, rnd);
  },
  [Tile.Leaves]: (_x, _y, rnd) => {
    const c = rnd() > 0.975 ? C.leafPale : dab(C.leafShade, C.leaf, C.leafLight, 0.2, 0.14, rnd);
    return grain(c, 0.04, rnd);
  },
};

/** Paints every tile into a fresh atlas canvas. Call only in the browser. */
export function createAtlasCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(canvas.width, canvas.height);
  const data = image.data;
  for (let tile = 0; tile < TILE_COUNT; tile++) {
    const paint = PAINTERS[tile as TileId];
    const rnd = mulberry32(0x9e3779b1 ^ (tile * 7919));
    const ox = (tile % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const c = paint(x, y, rnd);
        const i = ((oy + y) * canvas.width + ox + x) * 4;
        data[i] = Math.max(0, Math.min(255, Math.round(c[0])));
        data[i + 1] = Math.max(0, Math.min(255, Math.round(c[1])));
        data[i + 2] = Math.max(0, Math.min(255, Math.round(c[2])));
        data[i + 3] = c[3];
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** A 16px data URL of a block's face, for the hotbar (draw it pixelated). */
export function blockIconURL(atlas: HTMLCanvasElement, block: number): string {
  const def = BLOCKS[block];
  const tile = block === MOSS ? def.side : def.top;
  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const sx = (tile % ATLAS_COLS) * TILE_PX;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
  return canvas.toDataURL("image/png");
}
