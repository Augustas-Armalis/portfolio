"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { play } from "@/lib/sfx";
import { getMats } from "./materials";
import { clamp01, easeInOutCubic, nowS } from "./shared";

// The novel as a physical book. Closed it sits on the desk; in reading mode
// the cover swings open and pages turn with a curling page (bent geometry in
// the vertex shader). Pages are typeset on demand from /content/novel.json
// into canvas textures: serif text, chapter illustrations, page numbers.

const BW = 0.135; // closed width (x)
const BD = 0.205; // depth (z)
const BT = 0.021; // thickness
const PW = 0.132; // page size
const PD = 0.2;
const SPINE_X = -BW / 2;
const BOARD = 0.0014; // cover board thickness
const BLOCK = 0.0186; // the whole page block, shut
const HALF = 0.0096; // each side of the block when it lies open

type Novel = { title: string; author: string; illustrator?: string; years?: string; chapters: { id: string; title: string; paragraphs: string[]; image?: string }[] };
type Line = { t: string; x: number; big?: boolean };
type Page = { kind: "title" } | { kind: "text"; lines: Line[]; image?: string; heading?: string; n: number };

const PX = { w: 1000, h: 1515, m: 92, top: 128, bottom: 120, size: 31, lead: 47 };
const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`;

function paginate(novel: Novel): Page[] {
  const c = document.createElement("canvas").getContext("2d")!;
  c.font = `${PX.size}px ${SERIF}`;
  const width = PX.w - PX.m * 2;
  const pages: Page[] = [{ kind: "title" }];
  let n = 1;
  let cur: Extract<Page, { kind: "text" }> = { kind: "text", lines: [], n: n++ };
  let y = PX.top;
  const maxY = PX.h - PX.bottom;
  const newPage = (extra?: Partial<Extract<Page, { kind: "text" }>>) => {
    if (cur.lines.length || cur.heading) pages.push(cur);
    cur = { kind: "text", lines: [], n: n++, ...extra };
    y = PX.top;
  };
  novel.chapters.forEach((ch) => {
    newPage({ heading: ch.title, image: ch.image });
    y = PX.top + (ch.image ? 560 : 180) + 70;
    ch.paragraphs.forEach((para, pi) => {
      const words = para.replace(/\s+/g, " ").trim().split(" ");
      let line = "";
      let first = true;
      const indent = pi === 0 ? 0 : 42;
      const flush = () => {
        if (y + PX.lead > maxY) newPage();
        cur.lines.push({ t: line, x: first ? indent : 0 });
        y += PX.lead;
        first = false;
        line = "";
      };
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (c.measureText(test).width > width - (first ? indent : 0) && line) {
          flush();
          line = w;
        } else line = test;
      }
      if (line) flush();
    });
  });
  if (cur.lines.length) pages.push(cur);
  return pages;
}

const images = new Map<string, HTMLImageElement>();
function image(src: string, onload: () => void) {
  let im = images.get(src);
  if (!im) {
    im = new Image();
    im.src = src;
    images.set(src, im);
  }
  if (!im.complete) im.addEventListener("load", onload, { once: true });
  return im;
}

function paper(g: CanvasRenderingContext2D) {
  g.fillStyle = "#f5f1e8";
  g.fillRect(0, 0, PX.w, PX.h);
  const gr = g.createLinearGradient(0, 0, PX.w, 0);
  gr.addColorStop(0, "rgba(120,100,70,0.08)");
  gr.addColorStop(0.08, "rgba(120,100,70,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, PX.w, PX.h);
}

function drawPage(page: Page | undefined, novel: Novel | null, left: boolean, redraw: () => void) {
  const c = document.createElement("canvas");
  c.width = PX.w;
  c.height = PX.h;
  const g = c.getContext("2d")!;
  paper(g);
  if (left) {
    // spine shadow on the right edge for left pages
    g.save();
    g.translate(PX.w, 0);
    g.scale(-1, 1);
    const gr = g.createLinearGradient(0, 0, PX.w * 0.12, 0);
    gr.addColorStop(0, "rgba(90,70,40,0.12)");
    gr.addColorStop(1, "rgba(90,70,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, PX.w, PX.h);
    g.restore();
  }
  if (!left) {
    // gutter: the page curves into the spine
    const gr = g.createLinearGradient(0, 0, PX.w * 0.14, 0);
    gr.addColorStop(0, "rgba(90,70,40,0.16)");
    gr.addColorStop(1, "rgba(90,70,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, PX.w, PX.h);
  }
  g.fillStyle = "#2a2622";
  g.textBaseline = "alphabetic";
  if (!page || !novel) return c;
  if (page.kind === "title") {
    g.textAlign = "center";
    g.font = `500 64px ${SERIF}`;
    g.fillText(novel.title.toUpperCase(), PX.w / 2, 560);
    g.font = `italic 34px ${SERIF}`;
    g.fillStyle = "#4a443d";
    g.fillText(novel.author, PX.w / 2, 650);
    if (novel.illustrator) {
      g.font = `26px ${SERIF}`;
      g.fillText(`Iliustracijos: ${novel.illustrator}`, PX.w / 2, 1180);
    }
    if (novel.years) g.fillText(novel.years, PX.w / 2, 1230);
    return c;
  }
  if (page.heading) {
    if (page.image) {
      const im = image(page.image, redraw);
      if (im.complete && im.naturalWidth) {
        const s = 500;
        g.drawImage(im, (PX.w - s) / 2, PX.top, s, s);
      }
    }
    g.textAlign = "center";
    g.font = `500 44px ${SERIF}`;
    g.fillText(page.heading, PX.w / 2, PX.top + (page.image ? 560 : 180) + 10);
  }
  g.textAlign = "left";
  g.font = `${PX.size}px ${SERIF}`;
  let y = page.heading ? PX.top + (page.image ? 560 : 180) + 70 + PX.lead : PX.top + PX.lead;
  for (const l of page.lines) {
    g.fillText(l.t, PX.m + l.x, y);
    y += PX.lead;
  }
  g.textAlign = "center";
  g.font = `24px ${SERIF}`;
  g.fillStyle = "#7a7268";
  g.fillText(String(page.n), PX.w / 2, PX.h - 64);
  return c;
}

function makePageMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uFront: { value: null as THREE.Texture | null },
      uBack: { value: null as THREE.Texture | null },
      uP: { value: 0 },
      uCurl: { value: 0 },
      uDir: { value: 1 },
      uLight: { value: 1 },
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
      uniform sampler2D uFront; uniform sampler2D uBack; uniform float uLight;
      varying vec2 vUv; varying float vShade;
      void main(){
        vec4 c = gl_FrontFacing ? texture2D(uFront, vUv) : texture2D(uBack, vec2(1.0 - vUv.x, vUv.y));
        gl_FragColor = vec4(c.rgb * vShade * uLight, 1.0);
        #include <colorspace_fragment>
      }`,
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
  const novel = useRef<Novel | null>(null);
  const pages = useRef<Page[]>([]);
  const st = useRef({ spread: 0, open: 0, openTarget: 0, turn: null as null | { dir: 1 | -1; t0: number; from: number; to: number; drag: boolean }, closing: false });
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
  const ribbon = useRef<THREE.Group>(null);
  const geom = useRef({ top: BT });
  const drag = useRef({ x: 0, y: 0, travel: 0, target: 0 });
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
  const texCache = useRef(new Map<string, THREE.CanvasTexture>());
  // pages are lit like under a reading lamp, so they read at any time of day
  const left = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f3efe6", toneMapped: false }), []);
  const right = useMemo(() => new THREE.MeshBasicMaterial({ color: "#f6f2e9", toneMapped: false }), []);
  const turnMat = useMemo(makePageMaterial, []);
  const turnGeo = useMemo(pageGeometry, []);
  const blank = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 12;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f5f1e8";
    g.fillRect(0, 0, 8, 12);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  const spreads = () => Math.ceil((pages.current.length + 1) / 2);
  const tex = (idx: number, isLeft: boolean): THREE.Texture => {
    if (idx < 0 || idx >= pages.current.length) return blank;
    const key = `${idx}`;
    let t = texCache.current.get(key);
    if (!t) {
      const c = drawPage(pages.current[idx], novel.current, isLeft, () => {
        const t2 = texCache.current.get(key);
        if (!t2) return;
        const c2 = drawPage(pages.current[idx], novel.current, isLeft, () => {});
        (t2.image as HTMLCanvasElement).getContext("2d")!.drawImage(c2, 0, 0);
        t2.needsUpdate = true;
      });
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      texCache.current.set(key, t);
      // keep memory bounded
      if (texCache.current.size > 14) {
        const first = texCache.current.keys().next().value as string;
        texCache.current.get(first)?.dispose();
        texCache.current.delete(first);
      }
    }
    return t;
  };
  // spread s: left = page 2s-1, right = page 2s (page 0 is the title page)
  const show = (s: number) => {
    left.map = s === 0 ? blank : tex(2 * s - 1, true);
    right.map = tex(2 * s, false);
    left.needsUpdate = right.needsUpdate = true;
    onInfo({ spread: s, spreads: spreads(), ready: pages.current.length > 0 });
  };

  useEffect(() => {
    if (!reading || novel.current) return;
    let dead = false;
    fetch("/content/novel.json")
      .then((r) => r.json())
      .then((n: Novel) => {
        if (dead) return;
        novel.current = n;
        pages.current = paginate(n);
        show(st.current.spread);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

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
    if (s.turn || s.open < 0.98 || !pages.current.length) return false;
    if (dir === 1 && 2 * s.spread + 1 >= pages.current.length) return false;
    if (dir === -1 && s.spread === 0) return false;
    const p0 = dir === 1 ? 0 : 1;
    turnMat.uniforms.uP.value = p0;
    turnMat.uniforms.uDir.value = dir;
    s.turn = { dir, t0: nowS(), from: p0, to: drag ? p0 : 1 - p0, drag };
    if (dir === 1) {
      turnMat.uniforms.uFront.value = tex(2 * s.spread, false);
      turnMat.uniforms.uBack.value = tex(2 * s.spread + 1, true);
      right.map = tex(2 * s.spread + 2, false);
    } else {
      turnMat.uniforms.uFront.value = tex(2 * s.spread - 2, false);
      turnMat.uniforms.uBack.value = s.spread - 1 === 0 ? blank : tex(2 * s.spread - 1, true);
      left.map = s.spread - 1 === 0 ? blank : tex(2 * s.spread - 3, true);
    }
    left.needsUpdate = right.needsUpdate = true;
    if (turnMesh.current) turnMesh.current.visible = true;
    return true;
  };
  const turn = (dir: 1 | -1) => {
    if (begin(dir, false)) play("page");
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
      play("page", { volume: 0.6 });
    },
  };

  useFrame((_, dt) => {
    const s = st.current;
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
      pageL.current.position.y = -(tL + 0.0003);
    }
    if (pageR.current) {
      pageR.current.visible = o > 0.02 || peek > 0;
      pageR.current.position.y = top + 0.0003;
    }
    if (shadow.current) shadow.current.position.y = top + 0.0004;
    if (gutter.current) {
      gutter.current.position.y = top + 0.0005;
      gutterMat.opacity = clamp01((o - 0.7) / 0.3);
      gutter.current.visible = o > 0.7;
    }
    if (turnMesh.current) {
      turnMesh.current.position.y = top + 0.0007;
      turnMesh.current.visible = !!s.turn;
    }
    // ribbon: tucked between the pages when shut, lying in the gutter when open
    if (ribbon.current) {
      ribbon.current.position.x = THREE.MathUtils.lerp(SPINE_X + 0.03, SPINE_X, o);
      ribbon.current.position.y = top + 0.0009 - (1 - o) * 0.0006;
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
      {/* ribbon bookmark: sewn into the head of the spine, down the gutter, its tail past the foot */}
      <group ref={ribbon} position={[SPINE_X + 0.03, BT, 0]}>
        <mesh material={m.ribbon}>
          <boxGeometry args={[0.0022, 0.0003, BD - 0.002]} />
        </mesh>
        <mesh material={m.ribbon} position={[0, -0.0035, BD / 2 + 0.0135]} rotation={[0.25, 0, 0]}>
          <boxGeometry args={[0.0022, 0.0003, 0.03]} />
        </mesh>
      </group>
      {/* back board + page block */}
      <mesh material={m.paperBlack} position={[0, BOARD / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BW, BOARD, BD]} />
      </mesh>
      <mesh ref={blockR} material={m.pages} position={[SPINE_X + 0.0004 + PW / 2, BOARD + BLOCK / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[PW, BLOCK, BD - 0.004]} />
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
        <planeGeometry args={[PW, PD * 1.04]} />
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
          <boxGeometry args={[PW, HALF, BD - 0.004]} />
        </mesh>
        <mesh ref={pageL} visible={false} material={left} position={[PW / 2, -HALF, 0]} rotation={[Math.PI / 2, 0, Math.PI]} onPointerDown={grab(-1)} onPointerMove={dragTo}>
          <planeGeometry args={[PW, PD]} />
        </mesh>
      </group>
    </group>
  );
}

export const BOOK_DIMS = { BW, BD, BT, SPINE_X };
