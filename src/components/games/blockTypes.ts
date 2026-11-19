// Block and atlas-tile definitions for Blocks.

export const AIR = 0;
export const MOSS = 1;
export const SOIL = 2;
export const SLATE = 3;
export const SAND = 4;
export const PLANK = 5;
export const BRICK = 6;
export const GLASS = 7;
export const LAMP = 8;
export const WATER = 9;
export const TRUNK = 10;
export const LEAVES = 11;
export const BLOCK_COUNT = 12;

/** Tiles in the texture atlas, laid out left-to-right, top-to-bottom. */
export const Tile = {
  MossTop: 0,
  MossSide: 1,
  Soil: 2,
  Slate: 3,
  Sand: 4,
  Plank: 5,
  Brick: 6,
  Glass: 7,
  Lamp: 8,
  Water: 9,
  TrunkSide: 10,
  TrunkTop: 11,
  Leaves: 12,
} as const;
export type TileId = (typeof Tile)[keyof typeof Tile];

export const TILE_COUNT = 13;
export const TILE_PX = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 4;

export interface BlockDef {
  name: string;
  top: TileId;
  side: TileId;
  bottom: TileId;
  /** The player collides with it. */
  solid: boolean;
  /** Fully hides the faces of neighbouring blocks. */
  opaque: boolean;
  /** Drawn at full brightness. */
  emissive: boolean;
}

function def(name: string, top: TileId, side: TileId = top, bottom: TileId = top, extra: Partial<BlockDef> = {}): BlockDef {
  return { name, top, side, bottom, solid: true, opaque: true, emissive: false, ...extra };
}

export const BLOCKS: readonly BlockDef[] = [
  def("Air", Tile.Soil, Tile.Soil, Tile.Soil, { solid: false, opaque: false }),
  def("Moss", Tile.MossTop, Tile.MossSide, Tile.Soil),
  def("Soil", Tile.Soil),
  def("Slate", Tile.Slate),
  def("Sand", Tile.Sand),
  def("Birch Plank", Tile.Plank),
  def("Clay Brick", Tile.Brick),
  def("Glass", Tile.Glass, Tile.Glass, Tile.Glass, { opaque: false }),
  def("Lamp", Tile.Lamp, Tile.Lamp, Tile.Lamp, { emissive: true }),
  def("Water", Tile.Water, Tile.Water, Tile.Water, { solid: false, opaque: false }),
  def("Trunk", Tile.TrunkTop, Tile.TrunkSide, Tile.TrunkTop),
  def("Leaves", Tile.Leaves),
];

/** Flat lookup tables for the hot loops. */
export const IS_OPAQUE = new Uint8Array(BLOCK_COUNT);
export const IS_SOLID = new Uint8Array(BLOCK_COUNT);
for (let i = 0; i < BLOCK_COUNT; i++) {
  IS_OPAQUE[i] = BLOCKS[i].opaque ? 1 : 0;
  IS_SOLID[i] = BLOCKS[i].solid ? 1 : 0;
}

/** The eight hotbar blocks, in slot order. */
export const PLACEABLE: readonly number[] = [MOSS, SOIL, SLATE, SAND, PLANK, BRICK, GLASS, LAMP];

export function isValidBlock(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id < BLOCK_COUNT;
}
