"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makeTempera, rng, type GroundPalette, type Puff, type V3 } from "./kit";
import { Birds, GreatSun, PaintedClouds, type Flock, type PaintedCloud } from "./life";
import { SKY_U } from "../sky";
import { WORLDS, voyage } from "./voyage";
import { useDeepLens } from "./fairy/shared";
import { buildCrest, buildSea, buildSpray, makeCrestMaterial, makeSeaMaterial, makeSprayMaterial, signTexture } from "./seafinale/ocean";
import { SHIPS, bodyAt, onFace, swellAt, swellDamp } from "./seafinale/shape";

// Sonata of the Sea. Finale (Jūros sonata. Finale, 1908). One colossal green wave rearing over the whole
// picture and curling forward, its crest breaking into fingers of foam like lace; small sailing ships riding
// the band of foam at its foot; green and amber water with strings of bubbles like beads of amber (and, in the
// foam of the face, his initials); a pale warm sky in level bands.
//
// Here the wave is three hundred metres high and more than a kilometre long, bowed like an arm round whoever
// comes toward it, and the sun stands low behind it so its upper water is lit from within. The plane comes in
// low over a running swell with the whole wave ahead and the ships small on its lower slope; goes round to the
// left and along the face, climbing, the crest curling overhead and its fingers hanging between the plane and
// the open sea; and at the wave's far end goes out through that hanging lace into calm.

const def = WORLDS.seafinale;
export const FINALE_PAL: GroundPalette = { a: [0.1, 0.2, 0.1], b: [0.2, 0.22, 0.1], c: [0.08, 0.16, 0.1] };

// a small ship as he drew them: a dark hull, a mast, two pale sails with a drawn edge, a pennant
function shipGeometry() {
  const k = new Kit();
  const hull: V3 = [0.012, 0.016, 0.04];
  // the hull: a long pointed bowl, flat on top
  const h = new THREE.SphereGeometry(1, 18, 10);
  const p = h.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // sharper at the bow than the stern, the sheer rising to both
    const ends = Math.pow(Math.abs(x), 2.2);
    p.setXYZ(i, x * (x > 0 ? 1.12 : 0.94), Math.min(y, 0.18) + ends * 0.36 + (y > 0.18 ? 0 : 0), p.getZ(i) * (1 - 0.72 * ends));
  }
  k.add(h, [0, 0.6, 0], hull, { scale: [8.4, 2.3, 2.5], top: [0.03, 0.04, 0.085] });
  // a pale line along the gunwale
  k.box(15.4, 0.14, 0.14, [0.3, 1.36, 1.5], [0.6, 0.52, 0.34]);
  k.box(15.4, 0.14, 0.14, [0.3, 1.36, -1.5], [0.6, 0.52, 0.34]);
  const wood: V3 = [0.05, 0.035, 0.03];
  k.add(new THREE.CylinderGeometry(0.1, 0.17, 17, 6), [0.6, 9.4, 0], wood);
  k.add(new THREE.CylinderGeometry(0.07, 0.09, 12.5, 5), [0.9, 3.0, 0], wood, { rot: [0, 0, Math.PI / 2 - 0.04] });
  // sails: bellied a little, cream, each edged with a dark drawn line
  const sail = (pts: V3[], belly: number, dark: boolean) => {
    const g = new THREE.BufferGeometry();
    const N = 8;
    const pos: number[] = [];
    const idx: number[] = [];
    const [a, b, c] = pts.map((q) => new THREE.Vector3(...q));
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N - i; j++) {
        const u = i / N;
        const v = j / N;
        const q = a
          .clone()
          .multiplyScalar(1 - u - v)
          .addScaledVector(b, u)
          .addScaledVector(c, v);
        q.z += belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v + 0.2)) + belly * 16 * u * v * (1 - u - v);
        pos.push(q.x, q.y, q.z);
      }
    const at = (i: number, j: number) => {
      let o = 0;
      for (let q = 0; q < i; q++) o += N - q + 1;
      return o + j;
    };
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N - i; j++) {
        idx.push(at(i, j), at(i + 1, j), at(i, j + 1));
        if (j < N - i - 1) idx.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, [0, 0, 0], dark ? [0.014, 0.018, 0.05] : [0.8, 0.72, 0.5], { top: dark ? [0.03, 0.04, 0.1] : [0.96, 0.9, 0.7], glow: dark ? 0 : 0.04 });
    k.tube([pts[0], pts[1], pts[2], pts[0]], 0.07, dark ? [0.5, 0.42, 0.26] : [0.05, 0.04, 0.05], { seg: 30, sides: 4 });
  };
  sail(
    [
      [0.9, 3.1, 0],
      [0.75, 17.4, 0],
      [-6.6, 3.2, 0],
    ],
    1.5,
    true,
  );
  sail(
    [
      [1.0, 4.2, 0],
      [0.8, 15.2, 0],
      [7.7, 2.5, 0],
    ],
    1.1,
    false,
  );
  // the pennant at the masthead
  k.box(1.9, 0.34, 0.03, [-0.4, 17.9, 0], [0.7, 0.2, 0.12], { glow: 0.1 });
  return k.build();
}

export default function SeaFinaleWorld({ props }: { props: WorldProps }) {
  // (the near plane at arm's length while this world is flown: far surfaces do not shimmer)
  useDeepLens("seafinale");
  const ships = useRef<(THREE.Mesh | null)[]>([]);
  const b = useDisposable(() => {
    const r = rng(1908);
    const crest = buildCrest(props.mobile);
    const sign = signTexture();
    // spray haze: where the crest's water comes down, along the wave's foot, and far out where the sea meets the sky
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 12 : 26); i++) {
      const s = -780 + r() * 1560;
      const [x, z] = onFace(s, 1.25 + r() * 0.3);
      puffs.push({ p: [x, 10 + r() * 40, z], size: 40 + r() * 60, a: 0.16 });
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = 1700 + r() * 600;
      puffs.push({ p: [Math.cos(a) * d, 10 + r() * 20, 100 + Math.sin(a) * d], size: 280 + r() * 240, a: 0.25 });
    }
    // the sky's level rows of small rounded cloud, going off to the horizon behind the wave and to either side
    const clouds: PaintedCloud[] = [];
    const rows = props.mobile ? 5 : 8;
    for (let row = 0; row < rows; row++) {
      const d = 1500 + row * 150;
      const y = 300 + row * 115 + r() * 30;
      const per = props.mobile ? 9 : 16;
      for (let i = 0; i < per; i++) {
        const a = -Math.PI * 0.5 + ((i + r() * 0.7) / per - 0.5) * Math.PI * 1.7;
        clouds.push({ p: [Math.cos(a) * d, y + r() * 50, -200 + Math.sin(a) * d], w: 130 + r() * 150 + row * 14, seed: r() });
      }
    }
    // white birds low over the swell, and a skein high over the crest
    const flocks: Flock[] = [
      { c: [120, 46, 330], r: 150, n: 14, size: 1.5, speed: 11 },
      { c: [-220, 70, 250], r: 190, n: 10, size: 1.4, speed: 10 },
      { c: [-60, 470, -260], r: 300, n: 18, size: 2.2, speed: 9 },
    ];
    return {
      sea: buildSea(props.mobile),
      seaMat: makeSeaMaterial(sign),
      sign,
      crest: crest.geo,
      crestMat: makeCrestMaterial(),
      spray: buildSpray(crest.tips, props.mobile ? 1400 : Math.round(2600 + 2400 * props.effects)),
      sprayMat: makeSprayMaterial(),
      ship: shipGeometry(),
      shipMat: makeTempera({ amb: 1.0, key: 0.45, rim: [0.5, 0.4, 0.16], rimPow: 3, wrap: 0.5 }),
      puffs,
      clouds,
      flocks,
    };
  }, [props.mobile, props.effects > 0.5]);
  const tmp = useRef({ up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), m: new THREE.Matrix4() });
  useFrame(() => {
    if (voyage.cur !== "seafinale") return;
    const t = SKY_U.uTime.value;
    const { up, fwd, right, m } = tmp.current;
    // the ships ride the water that is drawn: lifted and tilted by the swell and by the slope of the wave, each
    // working slowly up the face and slipping back
    const h = (x: number, z: number) => {
      const body = bodyAt(x, z);
      return body + swellAt(x, z, t) * swellDamp(body);
    };
    SHIPS.forEach(([s0, f0, yaw, size], i) => {
      const mesh = ships.current[i];
      if (!mesh) return;
      const [x0, z0] = onFace(s0, f0);
      const climb = 26 * Math.sin(t * 0.05 + i * 1.7);
      const x = x0 + Math.sin(t * 0.031 + i) * 8;
      const z = z0 - climb;
      const y = h(x, z);
      const e = 5;
      up.set(y - h(x + e, z), e * 1.6, y - h(x, z + e)).normalize();
      // heading: as set, working a little as she goes; and a roll of her own
      const a = yaw + Math.sin(t * 0.23 + i * 2.1) * 0.12;
      fwd.set(Math.cos(a), 0, -Math.sin(a));
      right.crossVectors(fwd, up).normalize();
      fwd.crossVectors(up, right).normalize();
      m.makeBasis(fwd, up, right);
      mesh.quaternion.setFromRotationMatrix(m);
      mesh.rotateX(Math.sin(t * 0.7 + i * 1.3) * 0.07 + 0.1);
      mesh.position.set(x, y - 0.5 * size, z);
      mesh.scale.setScalar(size);
    });
  });
  return (
    <>
      <WorldBase id="seafinale" def={def} pal={FINALE_PAL} props={props} grass={false} ground={false} arch={false} pathTint={[1, 0.9, 0.6]} pathGain={0.3} angels={false} marks={false} />
      <GreatSun size={0.46} tint={[1, 0.78, 0.34]} rays={26} gain={0.38} />
      <PaintedClouds list={b.clouds} warm={[0.95, 0.8, 0.5]} shade={[0.5, 0.36, 0.2]} hi={[1.3, 1.12, 0.7]} order={-3} />
      <mesh geometry={b.sea} material={b.seaMat} frustumCulled={false} renderOrder={-4} />
      <mesh geometry={b.crest} material={b.crestMat} />
      <points geometry={b.spray} material={b.sprayMat} renderOrder={4} />
      {SHIPS.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            ships.current[i] = el;
          }}
          geometry={b.ship}
          material={b.shipMat}
        />
      ))}
      <Birds flocks={b.flocks} tint={[0.95, 0.9, 0.78]} seed={8} lit />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
    </>
  );
}
