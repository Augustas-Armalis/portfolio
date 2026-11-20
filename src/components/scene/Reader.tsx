"use client";

import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { play } from "@/lib/sfx";
import { getMats } from "./materials";
import { POST_U } from "./Post";
import { clamp01, easeInOutCubic, nowS } from "./shared";

// The novel as a physical book. Closed it sits on the desk; in reading mode
// the cover swings open and pages turn with a curling page (bent geometry in
// the vertex shader). The pages are his print edition itself: every page of
// the typeset PDF rendered to a greyscale image (/content/novel/pages/p001.png
// .. p144.png, 986 x 1400), printed here onto the book's own paper by the page
// shader (white becomes the paper's warm tone with its grain, black the ink).
// Page 1 is a right-hand page, so odd pages are always on the right. Only the
// spread being read and two pages either side are ever held in memory.

const BW = 0.135; // closed width (x)
const BD = 0.205; // depth (z)
const BT = 0.021; // thickness
const PW = 0.132; // page size
const PD = 0.2;
const SPINE_X = -BW / 2;
const BOARD = 0.0014; // cover board thickness
const BLOCK = 0.0186; // the whole page block, shut
const HALF = 0.0096; // each side of the block when it lies open

export const PAGES = 144;
const pageUrl = (n: number) => `/content/novel/pages/p${String(n).padStart(3, "0")}.png`;
// the printed page is a little shorter than the leaf it is printed on (986 x 1400 on a 132 x 200 mm leaf, width filled)
const PRINT_V = PW / (986 / 1400) / PD;

// The paper and what is printed on it, shared by the pages lying open and the leaf that turns.
const GLSL_PRINT = /* glsl */ `
  uniform float uLinearOut;
  float hashP(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnP(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hashP(i), hashP(i + vec2(1.0, 0.0)), f.x), mix(hashP(i + vec2(0.0, 1.0)), hashP(i + vec2(1.0, 1.0)), f.x), f.y); }
  vec3 printed(sampler2D map, float has, vec2 uv, float gutterSide){
    const vec3 PAPER = vec3(0.905, 0.862, 0.78);   // linear: a warm uncoated stock
    const vec3 INK = vec3(0.022, 0.019, 0.017);
    // the print sits in the middle of the leaf, its height ${(PRINT_V * 100).toFixed(1)}% of it
    float v = (uv.y - ${((1 - PRINT_V) / 2).toFixed(4)}) / ${PRINT_V.toFixed(4)};
    float lum = 1.0;
    if (has > 0.5 && v >= 0.0 && v <= 1.0) {
      // a touch sharper than the mip chain would choose: type stays crisp at an angle
      lum = texture2D(map, vec2(uv.x, v), -0.6).r;
    }
    // paper: long fibres and a fine tooth, and the leaf darkening a little into the gutter
    float grain = 0.96 + 0.04 * vnP(uv * vec2(260.0, 420.0)) + 0.02 * (vnP(uv * vec2(40.0, 900.0)) - 0.5);
    float gutter = mix(1.0, 0.86, pow(1.0 - clamp(abs(uv.x - gutterSide) / 0.12, 0.0, 1.0), 2.0));
    // ink sits on the paper, a little warmer than black, never pure
    return mix(INK, PAPER * grain, lum) * gutter;
  }
`;
function makePageMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uFront: { value: null as THREE.Texture | null },
      uBack: { value: null as THREE.Texture | null },
      uHasF: { value: 0 },
      uHasB: { value: 0 },
      uP: { value: 0 },
      uCurl: { value: 0 },
      uDir: { value: 1 },
      uLight: { value: 1 },
      ...POST_U,
    },
    vertexShader: /* glsl */ `
      uniform float uP; uniform float uCurl; uniform float uDir;
      varying vec2 vUv; varying float vShade;
      void main(){
        const float PI = 3.14159265;
        float W = ${PW.toFixed(4)};
        float s = position.x;            // arc length from the spine, 0 .. W
        float z0 = position.z;
        float sp = sin(uP * PI);
        // the page is a strip of constant curvature: the spine side leads, the
        // free edge lags behind (paper has no stretch, so integrate the angle),
        // and the near corner runs a little ahead of the far one
        float lag = uCurl * sp * 1.25 * uDir;
        float twist = uCurl * sp * 0.3 * (z0 / ${PD.toFixed(3)});
        float a0 = clamp(uP * PI + lag * 0.45, 0.0, PI);
        float a1 = clamp(uP * PI - lag * 0.55 + twist, 0.0, PI);
        float c = (a1 - a0) / W;
        float a = a0 + c * s;
        vec2 q = abs(c) < 0.01 ? vec2(cos(a0), sin(a0)) * s : vec2(sin(a) - sin(a0), cos(a0) - cos(a)) / c;
        vec3 p = vec3(q.x, q.y + sp * 0.0012, z0);
        vUv = uv;
        vShade = (0.8 + 0.2 * abs(cos(a))) * (0.9 + 0.1 * smoothstep(0.0, 0.12, s / W));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFront; uniform sampler2D uBack; uniform float uLight; uniform float uHasF; uniform float uHasB;
      varying vec2 vUv; varying float vShade;
      ${GLSL_PRINT}
      void main(){
        // its front is a right-hand page (gutter on its left edge), its back a left-hand one, seen mirrored
        vec3 c = gl_FrontFacing ? printed(uFront, uHasF, vUv, 0.0) : printed(uBack, uHasB, vec2(1.0 - vUv.x, vUv.y), 1.0);
        // a printed page is display-referred: through the lens it keeps its own paper white and ink (alpha 0, see Post)
        gl_FragColor = vec4(c * vShade * uLight, 1.0 - uLinearOut);
        #include <colorspace_fragment>
      }`,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// the page lying flat: the same paper and print, and like the turning leaf it passes through the lens untouched
function pageSurface(gutterSide: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: null as THREE.Texture | null }, uHas: { value: 0 }, ...POST_U },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uHas;
      varying vec2 vUv;
      ${GLSL_PRINT}
      void main(){
        gl_FragColor = vec4(printed(uMap, uHas, vUv, ${gutterSide.toFixed(1)}), 1.0 - uLinearOut);
        #include <colorspace_fragment>
      }`,
    // (each layer of the open book wins its depth test by a fixed step over the one under it)
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function pageGeometry() {
  const g = new THREE.PlaneGeometry(PW, PD, 44, 8);
  g.rotateX(-Math.PI / 2);
  g.translate(PW / 2, 0, 0);
  return g;
}

export type ReaderApi = { next: () => void; prev: () => void; close: () => void };
export type ReaderInfo = { spread: number; spreads: number; ready: boolean };

export function Reader({
  reading,
  peekAt,
  apiRef,
  onInfo,
  onClosed,
}: {
  reading: boolean;
  peekAt: number | null;
  apiRef: MutableRefObject<ReaderApi | null>;
  onInfo: (i: ReaderInfo) => void;
  onClosed: () => void;
}) {
  const m = getMats();
  const cover = useRef<THREE.Group>(null);
  const st = useRef({ spread: 0, open: 0, openTarget: 0, turn: null as null | { dir: 1 | -1; t0: number; from: number; to: number; drag: boolean; hand: boolean }, closing: false });
  const root = useRef<THREE.Group>(null);
  // soft contact shadow under the lifted page: darkest along the spine side
  const shadowMat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d")!;
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const u = x / 127;
        const v = y / 127;
        const ex = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.45);
        const ey = Math.min(1, v / 0.14) * Math.min(1, (1 - v) / 0.14);
        const a = ex * ex * (3 - 2 * ex) * ey * ey * (3 - 2 * ey);
        const i = (y * 128 + x) * 4;
        img.data[i] = 40;
        img.data[i + 1] = 30;
        img.data[i + 2] = 18;
        img.data[i + 3] = a * 255;
      }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, opacity: 0, side: THREE.DoubleSide });
  }, []);
  const blockR = useRef<THREE.Mesh>(null);
  const blockL = useRef<THREE.Mesh>(null);
  const spine = useRef<THREE.Mesh>(null);
  const pageR = useRef<THREE.Mesh>(null);
  const pageL = useRef<THREE.Mesh>(null);
  const turnMesh = useRef<THREE.Mesh>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const gutter = useRef<THREE.Mesh>(null);
  const geom = useRef({ top: BT });
  const drag = useRef({ x: 0, y: 0, travel: 0, target: 0 });
  const queued = useRef(0); // turns asked for while one is still in the air
  const { inv, ro, rd } = useMemo(() => ({ inv: new THREE.Matrix4(), ro: new THREE.Vector3(), rd: new THREE.Vector3() }), []);
  const gutterMat = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 4;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, "rgba(60,44,24,0)");
    gr.addColorStop(0.36, "rgba(60,44,24,0.07)");
    gr.addColorStop(0.5, "rgba(48,34,18,0.34)");
    gr.addColorStop(0.64, "rgba(60,44,24,0.07)");
    gr.addColorStop(1, "rgba(60,44,24,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false });
  }, []);
  // the print pages: loaded as they come near, never more than the spread and two pages either side
  const { gl } = useThree();
  const texCache = useRef(new Map<number, THREE.Texture>());
  const aniso = useMemo(() => gl.capabilities.getMaxAnisotropy(), [gl]);
  const loader = useMemo(() => new THREE.TextureLoader(), []);
  const left = useMemo(() => pageSurface(1), []);
  const right = useMemo(() => pageSurface(0), []);
  const turnMat = useMemo(makePageMaterial, []);
  const turnGeo = useMemo(pageGeometry, []);
  // which page each surface shows (0: none, the bare paper)
  const shown = useRef({ L: 0, R: 1, F: 0, B: 0 });
  const pageTex = (n: number): THREE.Texture | null => {
    if (n < 1 || n > PAGES) return null;
    let t = texCache.current.get(n);
    if (!t) {
      t = loader.load(pageUrl(n), (tx) => {
        tx.userData.ready = true;
        tx.needsUpdate = true;
      });
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      texCache.current.set(n, t);
    }
    return t;
  };
  // hold only what is near: the spread, the leaf that may turn either way, and one more each side
  const keepNear = (s: number) => {
    for (let n = 2 * s - 2; n <= 2 * s + 5; n++) pageTex(n);
    texCache.current.forEach((t, n) => {
      if (n < 2 * s - 4 || n > 2 * s + 7) {
        t.dispose();
        texCache.current.delete(n);
      }
    });
  };
  // bind each surface to its page, every frame: a page that arrives late simply appears (no flash of another)
  const bind = () => {
    const sh = shown.current;
    const set = (u: Record<string, THREE.IUniform>, map: string, has: string, n: number) => {
      const t = pageTex(n);
      const ok = !!t && t.userData.ready === true;
      u[map].value = ok ? t : null;
      u[has].value = ok ? 1 : 0;
    };
    set(left.uniforms, "uMap", "uHas", sh.L);
    set(right.uniforms, "uMap", "uHas", sh.R);
    set(turnMat.uniforms, "uFront", "uHasF", sh.F);
    set(turnMat.uniforms, "uBack", "uHasB", sh.B);
  };
  const SPREADS = Math.floor(PAGES / 2) + 1;
  // spread s: left = page 2s (none on the first), right = page 2s + 1 (none after the last)
  const show = (s: number) => {
    shown.current.L = 2 * s;
    shown.current.R = 2 * s + 1;
    keepNear(s);
    bind();
    onInfo({ spread: s, spreads: SPREADS, ready: true });
  };
  useEffect(
    () => () => {
      texCache.current.forEach((t) => t.dispose());
      texCache.current.clear();
    },
    [],
  );

  useEffect(() => {
    const s = st.current;
    if (reading) {
      s.closing = false;
      s.openTarget = 1;
      play("page", { volume: 0.7 });
      show(s.spread);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  // progress of the turning page: 0 = lying on the right, 1 = on the left
  const prog = () => (turnMat.uniforms.uP.value as number);
  const begin = (dir: 1 | -1, drag: boolean) => {
    const s = st.current;
    if (s.turn || s.open < 0.98) return false;
    if (dir === 1 && 2 * s.spread + 1 >= PAGES) return false;
    if (dir === -1 && s.spread === 0) return false;
    const p0 = dir === 1 ? 0 : 1;
    turnMat.uniforms.uP.value = p0;
    turnMat.uniforms.uDir.value = dir;
    s.turn = { dir, t0: nowS(), from: p0, to: drag ? p0 : 1 - p0, drag, hand: drag };
    const sh = shown.current;
    if (dir === 1) {
      // the right-hand page lifts: its back is the next left-hand page, and under it the next right
      sh.F = 2 * s.spread + 1;
      sh.B = 2 * s.spread + 2;
      sh.R = 2 * s.spread + 3;
    } else {
      // the left-hand page lifts back: its back is the right-hand page before, and under it the left before
      sh.F = 2 * s.spread - 1;
      sh.B = 2 * s.spread;
      sh.L = 2 * s.spread - 2;
    }
    bind();
    if (turnMesh.current) turnMesh.current.visible = true;
    return true;
  };
  const turn = (dir: 1 | -1) => {
    if (begin(dir, false)) {
      queued.current = 0;
      play("page");
      return;
    }
    // pressed again mid-turn: the next leaf follows as soon as this one lands
    const t = st.current.turn;
    // (a leaf turned by hand is its own gesture: the swipe that comes with it asks for nothing more)
    if (t && !t.hand && t.dir === dir && t.to === (dir === 1 ? 1 : 0)) queued.current = Math.min(3, Math.abs(queued.current) + 1) * dir;
    else queued.current = 0;
  };
  // let go of a dragged page: a plain click turns it, a drag finishes the turn
  // past the middle and falls back otherwise
  const release = () => {
    const t = st.current.turn;
    if (!t || !t.drag) return;
    const p = prog();
    const click = drag.current.travel < 6;
    const forward = click ? t.dir === 1 : p > 0.5;
    t.drag = false;
    t.from = p;
    t.to = forward ? 1 : 0;
    t.t0 = nowS();
    if ((t.dir === 1 && forward) || (t.dir === -1 && !forward)) play("page");
  };
  // the pointer on the plane of the open pages, in book space: the page
  // follows it (the free edge sits under the finger)
  const dragTo = (e: ThreeEvent<PointerEvent>) => {
    const t = st.current.turn;
    if (!t || !t.drag || !root.current) return;
    const d = drag.current;
    d.travel += Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y);
    d.x = e.nativeEvent.clientX;
    d.y = e.nativeEvent.clientY;
    inv.copy(root.current.matrixWorld).invert();
    ro.copy(e.ray.origin).applyMatrix4(inv);
    rd.copy(e.ray.direction).transformDirection(inv);
    if (Math.abs(rd.y) < 1e-4) return;
    const k = (geom.current.top - ro.y) / rd.y;
    const x = THREE.MathUtils.clamp((ro.x + rd.x * k - SPINE_X) / PW, -1, 1);
    d.target = Math.acos(x) / Math.PI;
  };
  const grab = (dir: 1 | -1) => (e: ThreeEvent<PointerEvent>) => {
    if (!reading) return;
    e.stopPropagation();
    if (!begin(dir, true)) return;
    const d = drag.current;
    d.x = e.nativeEvent.clientX;
    d.y = e.nativeEvent.clientY;
    d.travel = 0;
    d.target = dir === 1 ? 0 : 1;
    try {
      (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    dragTo(e);
    // a press alone doesn't move the page: it only starts following on a drag
    d.target = dir === 1 ? Math.min(d.target, 0.06) : Math.max(d.target, 0.94);
  };

  apiRef.current = {
    next: () => turn(1),
    prev: () => turn(-1),
    close: () => {
      const s = st.current;
      s.openTarget = 0;
      s.closing = true;
      queued.current = 0;
      play("page", { volume: 0.6 });
    },
  };

  useFrame((_, dt) => {
    const s = st.current;
    if (reading || s.open > 0.01) bind();
    // cover: smooth open/close; a small peek right after it lands on the desk
    let peek = 0;
    if (peekAt !== null) {
      const t = nowS() - peekAt;
      if (t > 0 && t < 1.2) peek = Math.sin((t / 1.2) * Math.PI) * 0.55;
    }
    s.open += (s.openTarget - s.open) * (1 - Math.exp(-dt * 4.2));
    if (s.closing && s.open < 0.02) {
      s.closing = false;
      s.open = 0;
      onClosed();
    }
    // Opening lays the book flat at its middle: the block under the right
    // page thins while a matching block grows under the left one, and the
    // hinge settles onto the desk, so both pages end up level.
    const o = easeInOutCubic(clamp01(s.open));
    const tR = THREE.MathUtils.lerp(BLOCK, HALF, o);
    const top = BOARD + tR;
    const hinge = THREE.MathUtils.lerp(BT, BOARD, o);
    const tL = HALF * clamp01((o - 0.3) / 0.7);
    geom.current.top = top;
    if (cover.current) {
      cover.current.rotation.z = o * Math.PI + peek * (1 - s.open);
      cover.current.position.y = hinge;
    }
    if (blockR.current) {
      blockR.current.scale.y = tR / BLOCK;
      blockR.current.position.y = BOARD + tR / 2;
    }
    if (spine.current) {
      spine.current.scale.y = hinge / BT;
      spine.current.position.y = hinge / 2;
    }
    if (blockL.current) {
      blockL.current.visible = tL > 0.0004;
      blockL.current.scale.y = Math.max(tL, 0.0004) / HALF;
      blockL.current.position.y = -Math.max(tL, 0.0004) / 2;
    }
    if (pageL.current) {
      pageL.current.visible = o > 0.55;
      pageL.current.position.y = -(tL + 0.0004);
    }
    if (pageR.current) {
      pageR.current.visible = o > 0.02 || peek > 0;
      pageR.current.position.y = top + 0.0004;
    }
    if (shadow.current) shadow.current.position.y = top + 0.0008;
    if (gutter.current) {
      gutter.current.position.y = top + 0.0009;
      gutterMat.opacity = clamp01((o - 0.7) / 0.3);
      gutter.current.visible = o > 0.7;
    }
    if (turnMesh.current) {
      turnMesh.current.position.y = top + 0.0012;
      turnMesh.current.visible = !!s.turn;
    }
    if (s.turn) {
      turnMat.uniforms.uCurl.value = 1;
      if (s.turn.drag) {
        const p = prog();
        turnMat.uniforms.uP.value = p + (drag.current.target - p) * (1 - Math.exp(-dt * 22));
      } else {
        const k = clamp01((nowS() - s.turn.t0) / (0.62 * Math.max(0.4, Math.abs(s.turn.to - s.turn.from))));
        turnMat.uniforms.uP.value = s.turn.from + (s.turn.to - s.turn.from) * easeInOutCubic(k);
        if (k >= 1) {
          const done = (s.turn.dir === 1 && s.turn.to === 1) || (s.turn.dir === -1 && s.turn.to === 0);
          if (done) s.spread += s.turn.dir;
          s.turn = null;
          if (turnMesh.current) turnMesh.current.visible = false;
          show(s.spread);
          if (queued.current !== 0) {
            const dir = queued.current > 0 ? 1 : -1;
            queued.current -= dir;
            if (begin(dir, false)) play("page");
            else queued.current = 0;
          }
        }
      }
      // the lifted page throws a soft shadow onto the page beneath
      const pp = prog();
      shadowMat.opacity = Math.sin(pp * Math.PI) * 0.22;
      if (shadow.current) {
        // it falls on whichever page the leaf is hanging over
        const side = pp < 0.5 ? 1 : -1;
        shadow.current.scale.x = side * (0.35 + 0.65 * Math.abs(Math.cos(pp * Math.PI)));
        shadow.current.position.x = SPINE_X + side * PW * 0.5 * Math.abs(shadow.current.scale.x);
      }
    } else shadowMat.opacity = 0;
  });

  return (
    <group ref={root} onPointerUp={release} onPointerCancel={release}>
      {/* back board + page block */}
      <mesh material={m.paperBlack} position={[0, BOARD / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BW, BOARD, BD]} />
      </mesh>
      <mesh ref={blockR} material={m.pages} position={[SPINE_X + 0.0004 + PW / 2, BOARD + BLOCK / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PW, BLOCK, PD - 0.001]} />
      </mesh>
      <mesh ref={spine} material={m.paperBlack} position={[SPINE_X + 0.0008, BT / 2, 0]}>
        <boxGeometry args={[0.0016, BT, BD]} />
      </mesh>
      {/* right page surface */}
      <mesh ref={pageR} visible={false} material={right} position={[SPINE_X + PW / 2, BT, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={grab(1)} onPointerMove={dragTo}>
        <planeGeometry args={[PW, PD]} />
      </mesh>
      {/* turning page, pivoting on the spine */}
      <mesh ref={turnMesh} visible={false} geometry={turnGeo} material={turnMat} position={[SPINE_X, BT, 0]} frustumCulled={false} onPointerMove={dragTo} />
      <mesh ref={shadow} material={shadowMat} position={[SPINE_X + PW * 0.4, BT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PW, PD * 0.98]} />
      </mesh>
      {/* the gutter: both pages roll softly down into the spine */}
      <mesh ref={gutter} visible={false} material={gutterMat} position={[SPINE_X, BT, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.04, PD]} />
      </mesh>
      {/* cover, hinged on the spine; its inside carries the pages already read */}
      <group ref={cover} position={[SPINE_X, BT, 0]}>
        <mesh material={m.cover} position={[BW / 2, BOARD / 2, 0]} castShadow>
          <boxGeometry args={[BW, BOARD, BD]} />
        </mesh>
        <mesh ref={blockL} visible={false} material={m.pages} position={[0.0004 + PW / 2, -HALF / 2, 0]}>
          <boxGeometry args={[PW, HALF, PD - 0.001]} />
        </mesh>
        <mesh ref={pageL} visible={false} material={left} position={[PW / 2, -HALF, 0]} rotation={[Math.PI / 2, 0, Math.PI]} onPointerDown={grab(-1)} onPointerMove={dragTo}>
          <planeGeometry args={[PW, PD]} />
        </mesh>
      </group>
    </group>
  );
}

export const BOOK_DIMS = { BW, BD, BT, SPINE_X };
