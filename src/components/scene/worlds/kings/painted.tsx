"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { KINGS } from "../voyage";
import { BY, GLSL_END, GLSL_KINGS, KINGS_UNIFORMS, R } from "./light";

// The two kings are his own: cut out of the painting, not modelled after it.
//
// Each king is lifted off the canvas in three soft-edged pieces (the robe and mantle behind; the crowned head with
// its hair and beard; the hands in front), and each piece is laid on a large sheet that stands where the picture
// has it, at the picture's own scale about the little world (his dome is 277 pixels across, ours sixty metres).
// The sheets are not flat: they bow round toward the way the plane comes, like the wall of an apse, lean out over
// the dome at the top, swell in the middle of every form and stand out a little wherever the paint is light. So
// the shapes, the faces, the folds and the brushwork are exactly the painting's, and yet as the plane goes by,
// head slides a little against robe and hand against head, and the dome's light rakes across the strokes.
//
// The little world itself is not on these sheets: it is cut away, and the real one stands in its place.
// Below the picture's lower edge the robes go on down into the dark and the mist to the ground.

const PW = 1280;
const PH = 1201;
// the middle of his little world on the canvas, and the line it stands on; metres to a pixel
const CX = 616;
const BASE = 940;
const S = (2 * R) / 277;
// how far the sheets bow toward the eye at the picture's sides, and lean out over the dome at its top (metres)
const APSE = 34;
const LEAN = 22;
// the small canvas the masks and the relief are worked out on
const AW = 320;
const AH = 300;

type Poly = [number, number][];
type Piece = { side: -1 | 1; z: number; poly: Poly; feather: number; pillow: number; lum: number; order: number; pivot?: [number, number] };

// (in the painting's own pixels, read off it tile by tile)
const PALE_ALL: Poly = [
  [300, 430], [330, 385], [420, 385], [510, 470], [456, 508], [434, 545], [420, 592], [407, 628], [414, 655], [444, 725], [465, 825], [480, 895], [488, 908], [490, 1012],
  [566, 1004], [600, 1040], [600, 1340], [0, 1340], [0, 700], [50, 640], [110, 585], [160, 545], [185, 495], [240, 455],
];
const PALE_HEAD: Poly = [
  [300, 428], [330, 385], [420, 385], [510, 470], [456, 508], [434, 545], [420, 592], [407, 628], [414, 655], [444, 725], [465, 825], [480, 895], [440, 925], [385, 905],
  [330, 830], [280, 730], [225, 620], [195, 545], [215, 480], [260, 442],
];
const PALE_HAND: Poly = [
  [296, 918], [390, 900], [488, 906], [492, 1014], [400, 1022], [296, 1006],
];
const DARK_ALL: Poly = [
  [708, 468], [760, 400], [820, 345], [880, 322], [935, 350], [990, 396], [1060, 420], [1140, 470], [1185, 600], [1215, 800], [1240, 1000], [1250, 1340], [632, 1340], [632, 1040],
  [666, 1004], [770, 985], [786, 950], [790, 880], [806, 845], [850, 826], [892, 810], [905, 760], [880, 680], [842, 600], [822, 560], [798, 530], [790, 482], [760, 490],
];
const DARK_HEAD: Poly = [
  [708, 468], [760, 400], [820, 345], [880, 322], [935, 352], [990, 400], [1002, 470], [984, 560], [962, 700], [942, 800], [900, 814], [905, 760], [880, 680], [842, 600],
  [822, 560], [798, 530], [790, 482], [760, 490],
];
const DARK_HAND: Poly = [
  [784, 848], [830, 820], [900, 800], [962, 790], [986, 842], [932, 902], [902, 962], [850, 978], [794, 962],
];
const PIECES: Piece[] = [
  { side: -1, z: -16, poly: PALE_ALL, feather: 16, pillow: 9, lum: 5, order: 2 },
  { side: 1, z: -16, poly: DARK_ALL, feather: 16, pillow: 9, lum: 5, order: 2 },
  { side: -1, z: -7, poly: PALE_HEAD, feather: 12, pillow: 7, lum: 6, order: 3, pivot: [330, 640] },
  { side: 1, z: -7, poly: DARK_HEAD, feather: 12, pillow: 7, lum: 6, order: 3, pivot: [900, 600] },
  { side: -1, z: 14, poly: PALE_HAND, feather: 9, pillow: 5, lum: 4, order: 4 },
  { side: 1, z: 2, poly: DARK_HAND, feather: 10, pillow: 5, lum: 4, order: 4 },
];

// where a point of the canvas stands in the wood (the world's own coordinates), before any relief
const place = (px: number, py: number, z: number): [number, number, number] => {
  const x = (px - CX) * S;
  const y = BY + (BASE - py) * S;
  const up = Math.max(0, y - BY) / 130;
  return [x, y, KINGS.z + z + APSE * (x / 135) * (x / 135) + LEAN * up * up];
};

// three passes of a box come very near a gaussian; `r` in samples
function blur(a: Float32Array, w: number, h: number, r: number) {
  const b = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, n: number, stride: number, lines: number, step: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * step;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[o + Math.min(n - 1, Math.max(0, i)) * stride];
      for (let i = 0; i < n; i++) {
        dst[o + i * stride] = acc / (2 * r + 1);
        acc += src[o + Math.min(n - 1, i + r + 1) * stride] - src[o + Math.max(0, i - r) * stride];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, w, 1, h, w);
    pass(b, a, h, w, w, 1);
  }
  return a;
}

function build(img: HTMLImageElement) {
  // the painting's own light, softened: what stands out of the relief
  const c = document.createElement("canvas");
  c.width = AW;
  c.height = AH;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, AW, AH);
  const px = g.getImageData(0, 0, AW, AH).data;
  const lum = new Float32Array(AW * AH);
  for (let i = 0; i < lum.length; i++) lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.55 + px[i * 4 + 2] * 0.15) / 255;
  blur(lum, AW, AH, 2);

  const paint = new THREE.Texture(img);
  paint.colorSpace = THREE.SRGBColorSpace;
  paint.flipY = false;
  paint.wrapS = paint.wrapT = THREE.ClampToEdgeWrapping;
  paint.anisotropy = 8;
  paint.needsUpdate = true;

  const sx = AW / PW;
  const sy = AH / PH;
  // every piece's cut, soft; and the same again far softer: how deep inside the form a point lies (the swell of the relief)
  const cuts = PIECES.map((p) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, AW, AH);
    g.fillStyle = "#fff";
    g.beginPath();
    p.poly.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)));
    g.closePath();
    g.fill();
    const m = g.getImageData(0, 0, AW, AH).data;
    const mask = new Float32Array(AW * AH);
    for (let i = 0; i < mask.length; i++) mask[i] = m[i * 4] / 255;
    const deep = blur(mask.slice(), AW, AH, Math.max(2, Math.round(p.feather * sx * 1.7)));
    blur(mask, AW, AH, Math.max(1, Math.round(p.feather * sx * 0.45)));
    return { mask, deep };
  });
  // A piece that lies behind another is cut away under the heart of it (all but a margin under its edge): as the eye
  // moves the front piece slides over the back one, and there must be no second face there to show beside the first.
  PIECES.forEach((p, k) => {
    PIECES.forEach((q, n) => {
      if (q.side !== p.side || q.order <= p.order) return;
      const over = cuts[n].deep;
      const mine = cuts[k].mask;
      for (let i = 0; i < mine.length; i++) mine[i] *= 1 - THREE.MathUtils.smoothstep(over[i] * 1.1, 0.62, 0.9);
    });
  });
  const pieces = PIECES.map((p, k) => {
    const { mask, deep } = cuts[k];
    const data = new Uint8Array(AW * AH * 4);
    for (let i = 0; i < mask.length; i++) {
      data[i * 4] = Math.round(mask[i] * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, deep[i] * 1.1) * 255);
      data[i * 4 + 2] = Math.round(lum[i] * 255);
      data[i * 4 + 3] = 255;
    }
    const aux = new THREE.DataTexture(data, AW, AH, THREE.RGBAFormat);
    aux.magFilter = aux.minFilter = THREE.LinearFilter;
    aux.needsUpdate = true;

    // the sheet: a net over the piece and a margin round it, a knot every nine pixels of canvas
    let x0 = 1e9;
    let x1 = -1e9;
    let y0 = 1e9;
    let y1 = -1e9;
    for (const [x, y] of p.poly) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    x0 = Math.max(0, x0 - p.feather * 2);
    x1 = Math.min(PW, x1 + p.feather * 2);
    y0 = Math.max(0, y0 - p.feather * 2);
    y1 = y1 > PH ? y1 : Math.min(PH, y1 + p.feather * 2);
    const nx = Math.max(2, Math.round((x1 - x0) / 9));
    const ny = Math.max(2, Math.round((y1 - y0) / 9));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const cx = x0 + ((x1 - x0) * i) / nx;
        const cy = y0 + ((y1 - y0) * j) / ny;
        pos.push(...place(cx, cy, p.z));
        uv.push(cx / PW, cy / PH);
      }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += 20;
    const pv = p.pivot ? place(p.pivot[0], p.pivot[1], p.z) : [0, 0, 0];
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        ...KINGS_UNIFORMS,
        tPaint: { value: paint },
        tAux: { value: aux },
        uLay: { value: new THREE.Vector4(p.pillow, p.lum, p.side, p.pivot ? 1 : 0) },
        uPivot: { value: new THREE.Vector3(pv[0], pv[1], pv[2]) },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D tAux; uniform vec4 uLay; uniform vec3 uPivot; uniform float uTime; uniform vec4 uEvt;
        varying vec2 vUv; varying vec3 vWorld; varying float vFront;
        void main(){
          vUv = uv;
          vec3 a = texture2D(tAux, vec2(uv.x, min(uv.y, 0.986))).rgb;
          vec3 p = position;
          // the relief: every form swells toward its middle, and stands out a little more wherever the paint is light
          p.z += a.g * uLay.x + (a.b - 0.18) * uLay.y;
          // they breathe, very slowly: the whole figure the least bit out and back
          p.z += sin(uTime * 0.38 + uLay.z) * 0.6 * a.g;
          // the head moves the least amount about the neck, and bows a little closer over the light when the plane is near
          if (uLay.w > 0.5) {
            vec2 d = p.xy - uPivot.xy;
            float w = 1.0 - smoothstep(34.0, 80.0, length(d));
            float ang = uLay.z * ((sin(uTime * 0.09 + uLay.z * 1.7) * 0.6 + sin(uTime * 0.041 + 1.3) * 0.4) * 0.012 + 0.028 * uEvt.y) * w;
            float c = cos(ang); float s = sin(ang);
            p.xy = uPivot.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
          }
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          // (which side of the sheet the eye is on: the picture has only a front)
          vFront = cameraPosition.z - wp.z;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPaint; uniform sampler2D tAux; uniform vec4 uLay;
        varying vec2 vUv; varying vec3 vWorld; varying float vFront;
        ${GLSL_KINGS}
        float lumOf(vec3 c){ return dot(c, vec3(0.3, 0.55, 0.15)); }
        void main(){
          // (the photograph of the canvas has its frame's edge along the bottom and the sides: never read that far)
          vec2 uv = vec2(clamp(vUv.x, 0.006, 0.994), min(vUv.y, 0.986));
          vec3 aux = texture2D(tAux, uv).rgb;
          float a = smoothstep(0.1, 0.62, aux.r);
          if (a < 0.02) discard;
          vec3 paint = texture2D(tPaint, uv).rgb;
          // below the picture's own edge the robes go on down into the dark
          // (the last of the canvas already runs out into it, so there is no line where the picture stops)
          paint = mix(paint, vec3(0.013, 0.012, 0.011), smoothstep(0.93, 1.03, vUv.y) * 0.95);
          // close to, the tooth of his canvas (the picture is only so many pixels: this is what the eye finds beyond them)
          float dist = length(cameraPosition - vWorld);
          float tooth = (vnoise(vWorld.xy * 2.6 + vWorld.z) - 0.5) * 0.6 + (vnoise(vec2(vWorld.x * 9.0, vWorld.y * 1.2)) - 0.5) * 0.4;
          paint *= 1.0 + tooth * 0.22 * (1.0 - smoothstep(60.0, 220.0, dist));
          // the way the sheet faces, and on it the brushwork: where the paint is lighter it stands a little proud
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
          float l0 = lumOf(paint);
          float lx = lumOf(texture2D(tPaint, uv + vec2(1.6 / ${PW}.0, 0.0)).rgb);
          float ly = lumOf(texture2D(tPaint, uv + vec2(0.0, 1.6 / ${PH}.0)).rgb);
          n = normalize(n + (vec3(1.0, 0.0, 0.0) * (l0 - lx) + vec3(0.0, 1.0, 0.0) * (ly - l0)) * 2.4);
          // the picture holds its own light already; the little world's is laid over it softly, and breathes
          vec2 dl = domeLight(vWorld, n);
          float wrap = clamp(dl.x * 0.6 + 0.4, 0.0, 1.0);
          vec3 col = paint * (0.74 + DOME_WARM * dl.y * wrap * 1.5) * 1.12;
          // from behind there is no picture: only the dark of the cloth against the light
          col = mix(paint * 0.05 + vec3(0.004, 0.004, 0.005), col, smoothstep(-6.0, 6.0, vFront));
          gl_FragColor = vec4(kingsAir(col, vWorld), a);
          ${GLSL_END}
        }`,
    });
    return { geo, mat, aux, order: p.order };
  });
  return { paint, pieces };
}
type Built = ReturnType<typeof build>;

export function PaintedKings() {
  const [b, setB] = useState<Built | null>(null);
  useEffect(() => {
    let made: Built | null = null;
    let dead = false;
    const img = new Image();
    img.onload = () => {
      if (dead) return;
      made = build(img);
      setB(made);
    };
    img.src = "/assets/ciurlionis/kings.jpg";
    return () => {
      dead = true;
      made?.paint.dispose();
      made?.pieces.forEach((p) => {
        p.geo.dispose();
        p.mat.dispose();
        p.aux.dispose();
      });
    };
  }, []);
  if (!b) return null;
  return (
    <>
      {b.pieces.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} renderOrder={p.order} />
      ))}
    </>
  );
}
