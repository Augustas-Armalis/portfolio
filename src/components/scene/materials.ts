import * as THREE from "three";
import { POST_U } from "./Post";
import { BOOT } from "./shared";

// Procedural textures and the shared PBR materials. Built once, client only.

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// 1D smooth noise from a random table
function noise1(seed: number, n = 256) {
  const r = rng(seed);
  const t = Array.from({ length: n }, r);
  return (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return t[((i % n) + n) % n] * (1 - u) + t[(((i + 1) % n) + n) % n] * u;
  };
}

function woodTexture() {
  const W = 1024;
  const H = 512;
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const nA = noise1(7);
  const nB = noise1(19);
  const nC = noise1(31);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const warp = nA(x * 0.004 + y * 0.002) * 26 + nB(x * 0.02) * 4;
      const v = y + warp;
      const ring = Math.pow(Math.abs(Math.sin(v * 0.23 + nC(v * 0.03) * 2.0)), 8);
      const fine = nB(v * 0.9 + x * 0.002) * 0.5;
      const k = 1 - ring * 0.07 - fine * 0.06 + nC(x * 0.05 + y * 0.3) * 0.03;
      const i = (y * W + x) * 4;
      img.data[i] = 214 * k;
      img.data[i + 1] = 190 * k;
      img.data[i + 2] = 156 * k;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noiseTexture(size: number, seed: number, scale = 1) {
  const { c, g } = canvas(size, size);
  const img = g.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = 128 + (r() - 0.5) * 255 * scale;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Rows of fine perforations (the display's vents): one pitch of four staggered rows, as coverage.
function ventTexture(repeat: number) {
  const { c, g } = canvas(32, 64);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = "#fff";
  for (let r = 0; r < 4; r++)
    for (const x of r % 2 ? [16] : [0, 32]) {
      g.beginPath();
      g.ellipse(x, 8 + r * 16, 9.6, 5.2, 0, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(repeat, 1);
  t.anisotropy = 8;
  return t;
}

// The open knit of the headband canopy: a fine diagonal lattice, light yarn on a darker gap.
// `alpha` gives the same lattice as coverage, so the canopy lets a little of the world through.
function latticeTexture(alpha: boolean) {
  const S = 64;
  const { c, g } = canvas(S, S);
  g.fillStyle = alpha ? "#5e5e5e" : "#b9bbc0";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 5.5;
  g.lineCap = "round";
  for (let i = -S; i <= S * 2; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(i, S);
    g.lineTo(i + S, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  if (!alpha) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 5);
  t.anisotropy = 8;
  return t;
}

// The fabric inside the ear cushions: the same knit, with the driver's perforations as small dark clusters.
function earTexture() {
  const S = 128;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#d9dadd";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#77797f";
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const cx = x * 32 + (y % 2 ? 24 : 8);
      const cy = y * 32 + 16;
      for (const [dx, dy] of [[0, -6], [-6, 0], [6, 0], [0, 6]]) {
        g.beginPath();
        g.arc(cx + dx, cy + dy, 2.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function pagesTexture() {
  const { c, g } = canvas(256, 64);
  g.fillStyle = "#efeae0";
  g.fillRect(0, 0, 256, 64);
  const r = rng(5);
  for (let y = 0; y < 64; y += 1) {
    g.fillStyle = `rgba(120,108,90,${0.04 + r() * 0.08})`;
    g.fillRect(0, y, 256, 0.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Soft contact shadow, as coverage in the green channel (what an alphaMap
// reads): a rounded patch that is full under the object and eases out over the
// outer third, so it stays dark right at the footprint's edge.
function blobTexture() {
  const S = 128;
  const { c, g } = canvas(S, S);
  const img = g.createImageData(S, S);
  const R = 0.3;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const qx = Math.abs((x + 0.5) / S - 0.5) * 2 - (1 - R);
      const qy = Math.abs((y + 0.5) / S - 0.5) * 2 - (1 - R);
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R; // < 0 inside
      const t = Math.min(1, Math.max(0, -d / 0.3));
      const v = 255 * t * t * (3 - 2 * t);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// A fine knit for the ear cushions: pale yarn over slightly darker gaps, about a millimetre a stitch.
function knitTexture() {
  const S = 32;
  const { c, g } = canvas(S, S);
  g.fillStyle = "#bfc0c4";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 4.2;
  g.lineCap = "round";
  for (let i = -S; i <= S * 2; i += 8) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(i, S);
    g.lineTo(i + S, 0);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(14, 14);
  t.anisotropy = 8;
  return t;
}

// The novel's own cover (from his epub). Falls back to set type if it fails.
function typeCover() {
  const { c, g } = canvas(512, 776);
  g.fillStyle = "#0b0c10";
  g.fillRect(0, 0, 512, 776);
  g.fillStyle = "#f4f4f2";
  g.font = `600 52px Georgia, "Times New Roman", serif`;
  g.textAlign = "left";
  ["ŽIEMOS", "NAKTYS", "ŠVIESESNĖS"].forEach((l, i) => g.fillText(l, 44, 110 + i * 58));
  g.font = `500 20px -apple-system, Inter, sans-serif`;
  g.fillText("Augustas Armalis", 44, 730);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}


// Poly Haven CC0 textures (see CREDITS.md). Paths live here so they are easy to swap.
export const TEX = {
  wood: { map: "/scene/tex/white_oak_veneer_diff.jpg", normal: "/scene/tex/white_oak_veneer_nor.jpg", rough: "/scene/tex/white_oak_veneer_rough.jpg" },
  leather: { map: "/scene/tex/fabric_leather_02_diff.jpg", normal: "/scene/tex/fabric_leather_02_nor.jpg", rough: "/scene/tex/fabric_leather_02_rough.jpg" },
  knit: { map: "/scene/tex/knitted_fleece_diff.jpg", normal: "/scene/tex/knitted_fleece_nor.jpg" },
  cover: { map: "/assets/polyhaven/leather_white_diff_1k.jpg", normal: "/assets/polyhaven/leather_white_nor_gl_1k.jpg", rough: "/assets/polyhaven/leather_white_rough_1k.jpg" },
};

const loader = typeof window !== "undefined" ? new THREE.TextureLoader() : null;
function load(url: string, repeat: number, srgb: boolean) {
  const t = loader!.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function pbr(set: { map: string; normal: string; rough?: string }, repeat: number, ry = repeat) {
  const a = {
    map: load(set.map, repeat, true),
    normalMap: load(set.normal, repeat, false),
    ...(set.rough ? { roughnessMap: load(set.rough, repeat, false) } : {}),
  };
  Object.values(a).forEach((t) => t.repeat.set(repeat, ry));
  return a;
}

// Brushed aluminium: fine streaks in the roughness, plus anisotropy.
function brushedTexture() {
  const W = 512;
  const { c, g } = canvas(W, W);
  const img = g.createImageData(W, W);
  const r = rng(13);
  const rows = Array.from({ length: W }, () => r());
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const v = 150 + (rows[y] - 0.5) * 70 + (r() - 0.5) * 26;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 2);
  return t;
}

// Coverage-blended surfaces must leave the target's alpha at 1: the lens reads alpha as "grade this".
function keepAlpha<T extends THREE.Material>(m: T) {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return m;
}

export type Mats = ReturnType<typeof build>;
let cache: Mats | null = null;
let coverDone: Promise<void> = Promise.resolve();

function build() {
  const cover = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  coverDone = new Promise<void>((res) => {
    new THREE.TextureLoader().load(
      "/scene/novel-cover.jpg",
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        cover.map = t;
        cover.needsUpdate = true;
        res();
      },
      undefined,
      () => {
        cover.map = typeCover();
        cover.needsUpdate = true;
        res();
      },
    );
  });
  const pages = pagesTexture();
  return {
    wood: new THREE.MeshPhysicalMaterial({ ...pbr(TEX.wood, 2.4, 1.2), roughness: 0.85, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 0.12, clearcoatRoughness: 0.4 }),
    frame: new THREE.MeshStandardMaterial({ color: "#1e1e20", metalness: 0.35, roughness: 0.55 }),
    alu: new THREE.MeshPhysicalMaterial({ color: "#d4d6da", metalness: 1, roughness: 0.42, roughnessMap: brushedTexture(), anisotropy: 0.6 }),
    aluDark: new THREE.MeshPhysicalMaterial({ color: "#4b4d53", metalness: 0.9, roughness: 0.42 }),
    // bead-blasted anodised aluminium (display, headphone cups): no brushing, a soft even sheen
    anodised: new THREE.MeshStandardMaterial({ color: "#d3d1cd", metalness: 0.5, roughness: 0.5, envMapIntensity: 0.85 }),
    // the headphone cups: the same finish a shade deeper and more metallic, so they sit apart from the pale band and cushions
    cupAlu: new THREE.MeshStandardMaterial({ color: "#b4b5b8", metalness: 0.78, roughness: 0.4, envMapIntensity: 1 }),
    // satin silver plate and machined dials (camera, knobs)
    satin: new THREE.MeshStandardMaterial({ color: "#c9c7c3", metalness: 0.62, roughness: 0.36, envMapIntensity: 0.9 }),
    brass: new THREE.MeshStandardMaterial({ color: "#b8935a", metalness: 1, roughness: 0.38 }),
    // the headband frame's soft-touch coating
    softTouch: new THREE.MeshPhysicalMaterial({ color: "#b4b5b9", roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.5 }),
    meshDark: new THREE.MeshStandardMaterial({ color: "#3b3d42", roughness: 0.95 }),
    titanium: new THREE.MeshPhysicalMaterial({ color: "#bdbab3", metalness: 1, roughness: 0.34 }),
    steel: new THREE.MeshStandardMaterial({ color: "#d8dadd", metalness: 1, roughness: 0.14 }),
    glass: new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.25, metalness: 0, envMapIntensity: 0.15 }),
    reflect: new THREE.MeshStandardMaterial({
      color: "#3c3d42",
      roughness: 0.05,
      metalness: 1,
      envMapIntensity: 1,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    knit: new THREE.MeshPhysicalMaterial({ map: knitTexture(), normalMap: load(TEX.knit.normal, 2, false), normalScale: new THREE.Vector2(1.2, 1.2), color: "#cfd0d3", roughness: 1, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.6 }),
    canopy: keepAlpha(new THREE.MeshStandardMaterial({ map: latticeTexture(false), alphaMap: latticeTexture(true), color: "#c9cacd", roughness: 0.95, side: THREE.DoubleSide, transparent: true })),
    earMesh: new THREE.MeshStandardMaterial({ map: earTexture(), color: "#cfd0d3", roughness: 1 }),
    // the dark sleeve inside the stand's cable pass-through
    liner: new THREE.MeshStandardMaterial({ color: "#1b1b1d", roughness: 0.7, side: THREE.DoubleSide }),
    vents: keepAlpha(
      new THREE.MeshStandardMaterial({ color: "#060607", roughness: 0.9, alphaMap: ventTexture(260), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    ),
    leather: new THREE.MeshPhysicalMaterial({ ...pbr(TEX.leather, 3), color: "#3a3a3e", roughness: 1, clearcoat: 0.08 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#141416", roughness: 0.85 }),
    lens: new THREE.MeshPhysicalMaterial({
      color: "#07080b",
      roughness: 0.02,
      metalness: 0.1,
      clearcoat: 1,
      iridescence: 1,
      iridescenceIOR: 1.8,
      iridescenceThicknessRange: [260, 640],
      envMapIntensity: 1.6,
    }),
    keyWhite: new THREE.MeshPhysicalMaterial({ color: "#f5f5f3", roughness: 0.32, clearcoat: 0.4 }),
    keyBlack: new THREE.MeshPhysicalMaterial({ color: "#121214", roughness: 0.38, clearcoat: 0.5 }),
    oled: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.1 }),
    linen: new THREE.MeshStandardMaterial({ ...pbr(TEX.cover, 1), color: "#4a4d52", roughness: 1 }),
    pages: new THREE.MeshStandardMaterial({ map: pages, roughness: 0.95 }),
    paperBlack: new THREE.MeshStandardMaterial({ color: "#0d0e11", roughness: 0.55 }),
    cover,
    elastic: new THREE.MeshStandardMaterial({ color: "#111113", roughness: 0.7 }),
    ribbon: new THREE.MeshStandardMaterial({ color: "#7d2230", roughness: 0.55 }),
    pencil: new THREE.MeshPhysicalMaterial({ color: "#2c2e33", roughness: 0.35, clearcoat: 0.6 }),
    pencilWood: new THREE.MeshStandardMaterial({ color: "#d8b88e", roughness: 0.8 }),
    graphite: new THREE.MeshStandardMaterial({ color: "#2a2a2c", metalness: 0.5, roughness: 0.35 }),
    blob: new THREE.MeshBasicMaterial({ color: "#000000", alphaMap: blobTexture(), transparent: true, depthWrite: false, opacity: 0.5 }),
  };
}

// Moonlight: the night environment is dim, and metal shows little else, so the
// desk's metals and pale fabrics take more of it after dark (n = 0 day .. 1 night).
let litFor = -1;
export function nightLift(n: number) {
  if (!cache || Math.abs(n - litFor) < 0.004) return;
  litFor = n;
  const m = cache;
  const set = (mat: THREE.MeshStandardMaterial, base: number, gain: number) => (mat.envMapIntensity = base * (1 + gain * n));
  set(m.anodised, 0.85, 3.2);
  set(m.cupAlu, 1, 3);
  set(m.satin, 0.9, 3.2);
  set(m.steel, 1, 2.4);
  set(m.titanium, 1, 3);
  set(m.aluDark, 1, 3);
  set(m.softTouch, 1, 2.6);
  set(m.knit, 1, 2.2);
  set(m.canopy, 1, 2.2);
  set(m.earMesh, 1, 2.2);
}

export function getMats() {
  if (!cache) {
    cache = build();
    // dev: the shared materials on window, for tuning from the console
    if (process.env.NODE_ENV !== "production") (window as unknown as { __mats: Mats }).__mats = cache;
  }
  return cache;
}
export const coverReady = () => {
  getMats();
  return coverDone;
};

// The display content: black, then the boot mark and a thin progress bar.
// Drawn as signed distance fields in CSS px of the final, covering frame, so it
// is crisp at any distance and matches the DOM veil exactly. Writes display
// (sRGB) values directly, like CSS does.
export function makeScreenMaterial(size: [number, number]) {
  const { markY, markH, markW, stroke, barY, barW, barH } = BOOT;
  const f = (n: number) => n.toFixed(3);
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uSize: { value: new THREE.Vector2(...size) },
      uPx: { value: 1000 },
      uMark: { value: 0 },
      uProg: { value: 0 },
      uLock: { value: null as THREE.Texture | null },
      uLockMix: { value: 0 },
      ...POST_U,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSize; uniform float uPx; uniform float uMark; uniform float uProg;
      uniform sampler2D uLock; uniform float uLockMix; uniform float uLinearOut;
      varying vec2 vUv;
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      float rbox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float cover(float d){ float w = max(fwidth(d), 1e-4) * 0.5; return 1.0 - smoothstep(-w, w, d); }
      void main(){
        vec2 p = (vUv - 0.5) * uSize * uPx; p.y = -p.y;
        vec2 apex = vec2(0.0, ${f(markY - markH / 2)});
        vec2 fl = vec2(${f(-markW / 2)}, ${f(markY + markH / 2)});
        vec2 fr = vec2(${f(markW / 2)}, ${f(markY + markH / 2)});
        float cy = ${f(markY + markH * 0.16)};
        float cx = ${f((markW / 2) * 0.66)};
        float d = min(min(seg(p, apex, fl), seg(p, apex, fr)), seg(p, vec2(-cx, cy), vec2(cx, cy))) - ${f(stroke / 2)};
        float mark = cover(d);
        vec2 bp = p - vec2(0.0, ${f(barY)});
        float track = cover(rbox(bp, vec2(${f(barW / 2)}, ${f(barH / 2)}), ${f(barH / 2)}));
        float fw = max(${f(barW)} * uProg, ${f(barH)});
        float fill = cover(rbox(bp - vec2(${f(-barW / 2)} + fw * 0.5, 0.0), vec2(fw * 0.5, ${f(barH / 2)}), ${f(barH / 2)})) * step(0.001, uProg);
        float v = 0.0;
        v = mix(v, 1.0, mark * uMark);
        v = mix(v, 1.0, track * 0.2 * uMark);
        v = mix(v, 1.0, fill * uMark);
        vec3 col = vec3(v);
        if (uLockMix > 0.001) col = mix(col, texture2D(uLock, vUv).rgb, uLockMix);
        // into the lens' linear target it goes as linear light, flagged (alpha 0) to pass through ungraded
        if (uLinearOut > 0.5) { col = mix(col / 12.92, pow((col + 0.055) / 1.055, vec3(2.4)), step(0.04045, col)); gl_FragColor = vec4(col, 0.0); }
        else gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
