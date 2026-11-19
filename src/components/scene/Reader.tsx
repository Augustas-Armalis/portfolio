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
      uLight: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uP; uniform float uCurl;
      varying vec2 vUv; varying float vShade;
      void main(){
        float W = ${PW.toFixed(4)};
        float x0 = position.x;           // 0 at the spine .. W at the edge
        float z0 = position.z;
        float u = x0 / W;
        // the free edge lags behind the spine while the page is in the air,
        // and the lower corner leads a little: a soft diagonal curl
        float phi = uP * 3.14159 - uCurl * sin(uP * 3.14159) * (0.55 * u * u) + uCurl * sin(uP * 3.14159) * 0.22 * (z0 / ${PD.toFixed(3)}) * u;
        vec3 p = vec3(cos(phi) * x0, sin(phi) * x0 + 0.0006 + sin(uP * 3.14159) * 0.004, z0);
        vUv = uv;
        vShade = 0.86 + 0.14 * abs(cos(phi));
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
  const g = new THREE.PlaneGeometry(PW, PD, 28, 6);
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
  const shadowMat = useMemo(() => {
    const c = m.blob.clone();
    c.opacity = 0;
    return c;
  }, [m]);
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
    return true;
  };
  const turn = (dir: 1 | -1) => {
    if (begin(dir, false)) play("page");
  };
  // let go of a dragged page: finish the turn past halfway, else fall back
  const release = () => {
    const t = st.current.turn;
    if (!t || !t.drag) return;
    const p = prog();
    const forward = t.dir === 1 ? p > 0.35 : p > 0.65;
    t.drag = false;
    t.from = p;
    t.to = forward ? 1 : 0;
    t.t0 = nowS();
    if ((t.dir === 1 && forward) || (t.dir === -1 && !forward)) play("page");
  };
  const dragTo = (e: ThreeEvent<PointerEvent>) => {
    const t = st.current.turn;
    if (!t || !t.drag || !root.current) return;
    const local = root.current.worldToLocal(e.point.clone());
    // x from the spine: +PW = page lying right, -PW = lying left
    const x = THREE.MathUtils.clamp((local.x - SPINE_X) / PW, -1, 1);
    turnMat.uniforms.uP.value = Math.acos(x) / Math.PI;
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
    const ang = easeInOutCubic(clamp01(s.open)) * Math.PI + peek * (1 - s.open);
    if (cover.current) cover.current.rotation.z = ang;
    if (s.turn) {
      turnMat.uniforms.uCurl.value = 1;
      if (!s.turn.drag) {
        const k = clamp01((nowS() - s.turn.t0) / (0.6 * Math.max(0.35, Math.abs(s.turn.to - s.turn.from))));
        turnMat.uniforms.uP.value = s.turn.from + (s.turn.to - s.turn.from) * easeInOutCubic(k);
        if (k >= 1) {
          const done = (s.turn.dir === 1 && s.turn.to === 1) || (s.turn.dir === -1 && s.turn.to === 0);
          if (done) s.spread += s.turn.dir;
          s.turn = null;
          show(s.spread);
        }
      }
      // the lifted page throws a soft shadow onto the page beneath
      shadowMat.opacity = Math.sin(prog() * Math.PI) * 0.28;
    } else shadowMat.opacity = 0;
  });

  const open = st.current.open > 0.02 || reading;
  const turning = !!st.current.turn;
  return (
    <group ref={root} onPointerUp={release} onPointerLeave={release}>
      {/* ribbon bookmark, out of the head of the spine and over the foot */}
      <mesh material={m.ribbon} position={[SPINE_X + 0.032, BT + 0.0009, 0.016]} rotation={[0, 0.05, 0]}>
        <boxGeometry args={[0.0055, 0.0004, BD + 0.03]} />
      </mesh>
      {/* back board + page block */}
      <mesh material={m.paperBlack} position={[0, 0.0007, 0]} castShadow receiveShadow>
        <boxGeometry args={[BW, 0.0014, BD]} />
      </mesh>
      <mesh material={m.pages} position={[0.0012, 0.0107, 0]} castShadow receiveShadow>
        <boxGeometry args={[BW - 0.0024, 0.0186, BD - 0.004]} />
      </mesh>
      <mesh material={m.paperBlack} position={[SPINE_X + 0.0008, BT / 2, 0]}>
        <boxGeometry args={[0.0016, BT, BD]} />
      </mesh>
      {/* right page surface */}
      {open && (
        <mesh
          material={right}
          position={[0.0012, BT - 0.0003, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(e) => {
            if (!reading) return;
            e.stopPropagation();
            begin(1, true);
            dragTo(e);
          }}
          onPointerMove={dragTo}
        >
          <planeGeometry args={[PW, PD]} />
        </mesh>
      )}
      {/* turning page, pivoting on the spine */}
      {turning && (
        <mesh geometry={turnGeo} material={turnMat} position={[SPINE_X, BT + 0.0004, 0]} frustumCulled={false} onPointerMove={dragTo} />
      )}
      <mesh material={shadowMat} position={[SPINE_X + PW * 0.4, BT + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PW * 0.9, PD * 1.05]} />
      </mesh>
      {/* cover, hinged on the spine; its inside carries the left page */}
      <group ref={cover} position={[SPINE_X, BT, 0]}>
        <mesh material={m.cover} position={[BW / 2, 0.0007, 0]} castShadow>
          <boxGeometry args={[BW, 0.0014, BD]} />
        </mesh>
        {open && (
          <>
            {/* the pages already read: a thin block with paper edges */}
            <mesh material={m.pages} position={[BW / 2 + 0.0012, -0.0028, 0]}>
              <boxGeometry args={[BW - 0.0024, 0.0044, BD - 0.004]} />
            </mesh>
            <mesh
              material={left}
              position={[BW / 2 + 0.0012, -0.0052, 0]}
              rotation={[Math.PI / 2, 0, Math.PI]}
              onPointerDown={(e) => {
                if (!reading) return;
                e.stopPropagation();
                if (begin(-1, true)) dragTo(e);
              }}
              onPointerMove={dragTo}
            >
              <planeGeometry args={[PW, PD]} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

export const BOOK_DIMS = { BW, BD, BT, SPINE_X };
