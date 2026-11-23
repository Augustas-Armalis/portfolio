import { HER_AT, HER_S, herField, herLocal, herPart, toLocal } from "./her";
import { surfaceSteps, type Box, type Skin } from "./surface";

// Her skin, made in three boxes that meet a voxel into each other: the head (fine), the hand and forearm (finest:
// the fingers), and the shoulder, arm and body going down into the dark (coarse). Each vertex carries what it is
// (skin or hair) for the material.

export type HerSkin = Skin & { part: Float32Array };
const X_CUT = 52; // the hand's box ends here (along the forearm)
const Y_CUT = HER_AT.y - 0.19 * HER_S; // the head's box ends here (the neck's root, in her shadow)

export function herBoxes(coarse: number) {
  const head = 0.34 * coarse;
  const hand = 0.27 * coarse;
  const body = 0.75 * coarse;
  const z0 = HER_AT.z;
  return [
    { name: "head", voxel: head, box: { min: [X_CUT - head, Y_CUT - head, z0 - 0.11 * HER_S], max: [HER_AT.x + 0.15 * HER_S, HER_AT.y + 0.145 * HER_S, z0 + 0.11 * HER_S] } as Box },
    { name: "hand", voxel: hand, box: { min: [-14, 64, -50], max: [X_CUT + hand, 152, 18] } as Box },
    { name: "body", voxel: body, box: { min: [X_CUT - body, 6, z0 - 0.17 * HER_S], max: [HER_AT.x + 0.16 * HER_S, Y_CUT + body, z0 + 0.27 * HER_S] } as Box },
  ];
}

export function* herSteps(coarse: number, budget = Infinity): Generator<void, HerSkin[], void> {
  const out: HerSkin[] = [];
  for (const b of herBoxes(coarse)) {
    const skin = yield* surfaceSteps(herField, b.box, b.voxel, budget, 2.2);
    const nv = skin.pos.length / 3;
    const part = new Float32Array(nv);
    for (let v = 0; v < nv; v++) {
      const p = toLocal(skin.pos[v * 3], skin.pos[v * 3 + 1], skin.pos[v * 3 + 2]);
      herLocal(p[0], p[1], p[2]);
      part[v] = herPart();
    }
    out.push({ ...skin, part });
  }
  return out;
}
