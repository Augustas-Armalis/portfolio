"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html, Sparkles } from "@react-three/drei";
import { AnimatePresence } from "motion/react";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { owner, type UserId } from "@/content";
import { play } from "@/lib/sfx";
import { useOS } from "@/store";
import { Flowers, Grass } from "./scene/Grass";
import { CameraBody, Desk, Headphones, HeadphonesBlob, Monitor, Phone, glint } from "./scene/models";
import { coverReady, getMats, makeScreenMaterial } from "./scene/materials";
import { BookUI, CameraUI, FlightUI, MusicUI, NavBar, PianoUI, SketchUI } from "./scene/ModeUI";
import { Preloader } from "./scene/Overlays";
import { KEYMAP, PianoKeys, strike } from "./scene/Piano";
import { Plane, type PlaneApi } from "./scene/Plane";
import { Reader, type ReaderApi, type ReaderInfo } from "./scene/Reader";
import { SketchbookLive, type SketchApi } from "./scene/Sketch";
import {
  BOOT_T,
  DESK,
  LAYOUT,
  MONITOR,
  PHONE,
  PLANE_SPOT,
  RIG,
  bootProgress,
  clamp01,
  easeInOutCubic,
  easeInOutQuint,
  easeOutExpo,
  nowS,
  smooth,
  spring,
  type ObjKind,
  type Placement,
} from "./scene/shared";
import { SKY_U, applySky, clockHours, setTimeOverride, skyState } from "./scene/sky";
import { Birds, Ground, Lake, Mountains, Sky, Trees, makeSkyMaterial } from "./scene/World";

// The intro: a desk in a field under a live sky (the visitor's local time).
// Everything on the desk does something: the display boots the OS, the piano
// plays, the camera takes photos, the headphones play his music, the novel
// opens and turns its pages, the sketchbook takes a pencil, and the paper
// plane flies. After Shut Down the same scene is the machine's "off" state.

type Stage = "idle" | "approach" | "boot" | "done" | "wake" | "focus" | "unfocus" | "fly" | "land";
export type Mode = "none" | "piano" | "camera" | "music" | "book" | "sketch" | "plane";
type Input = { dx: number; dy: number; zoom: number; dragging: boolean; last: number; px: number; py: number; moved: boolean; sx: number; sy: number; keys: Set<string> };

const DUR = { approach: 1.55, push: 1.05, hold: 0.12, wake: 2.3, wakeDelay: 0.35, focus: 1.15 };
const FOG = 0.016;
const INTRO = 2.6; // seconds of aerial descent before the desk assembles
const LABELS: Record<ObjKind | "display" | "plane", string> = { keys: "Piano", camera: "Camera", headphones: "Music", book: "Read", sketchbook: "Sketch", plane: "Fly", display: "Start" };
const MODE_OF: Record<ObjKind, Mode> = { keys: "piano", camera: "camera", headphones: "music", book: "book", sketchbook: "sketch" };

// ---------- load-in motion ----------

type Motion = "rise" | "lower" | "drop" | "slide" | "settle";
type Land = { at: number; pos: THREE.Vector3 };

// Position offset, rotation offset and vertical squash for a piece t seconds
// into its entrance. Each kind of object gets its own motion.
function entrance(kind: Motion, t: number, from: [number, number, number], spin: number) {
  const out = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sy: 1, landed: t > 0.6 };
  if (t >= 4) return out;
  if (kind === "rise") {
    const e = spring(t, 8.5, 0.82);
    out.y = from[1] * (1 - e);
    out.landed = t > 0.5;
  } else if (kind === "lower") {
    // heavy: eases down, a tiny settle, then the glass glints
    const e = spring(t, 6.5, 0.95);
    out.y = from[1] * (1 - e);
    out.landed = t > 0.9;
  } else if (kind === "slide") {
    const e = spring(t, 9, 0.72);
    out.x = from[0] * (1 - e);
    out.z = from[2] * (1 - e);
    out.ry = spin * (1 - e);
    out.landed = t > 0.35;
  } else {
    // drop: a short anticipation lift, a gravity fall, then a squash and two small hops
    const h = from[1];
    const g = 4.2;
    const lift = 0.12;
    const T = Math.sqrt((2 * (h + 0.02)) / g);
    if (t < lift) {
      const k = t / lift;
      out.y = h + 0.02 * Math.sin(k * Math.PI * 0.5);
      out.x = from[0];
      out.z = from[2];
      out.ry = spin;
      out.rx = spin * 0.35;
    } else if (t < lift + T) {
      const tt = t - lift;
      const k = tt / T;
      out.y = Math.max(0, h + 0.02 - 0.5 * g * tt * tt);
      out.x = from[0] * (1 - k) * (1 - k);
      out.z = from[2] * (1 - k) * (1 - k);
      out.ry = spin * (1 - smooth(k));
      out.rx = spin * 0.35 * (1 - k);
    } else {
      const tl = t - lift - T;
      const bounce = Math.abs(Math.sin(tl * 13)) * Math.exp(-tl * 7) * 0.012;
      out.y = bounce;
      out.sy = 1 - 0.07 * Math.exp(-tl * 11) * Math.cos(tl * 26);
      if (kind === "settle") {
        out.rx = Math.sin(tl * 15) * Math.exp(-tl * 4) * 0.14;
        out.rz = Math.cos(tl * 13) * Math.exp(-tl * 4) * 0.1;
      }
    }
    out.landed = t > lift + T;
  }
  return out;
}

function Piece({
  p,
  motion,
  delay,
  introAt,
  instant,
  hoverable,
  label,
  onPick,
  land,
  hidden,
  float,
  children,
}: {
  p: { pos: [number, number, number]; rot: number; from: [number, number, number]; spin: number };
  motion: Motion;
  delay: number;
  introAt: MutableRefObject<number | null>;
  instant: boolean;
  hoverable: boolean;
  label?: string;
  onPick?: () => void;
  land?: Land;
  hidden?: boolean;
  float?: MutableRefObject<{ on: boolean; pos: THREE.Vector3; q: THREE.Quaternion } | null>;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const lift = useRef(0);
  const blend = useRef(0);
  const landed = useRef(false);
  const [hover, setHover] = useState(false);
  const base = useMemo(() => new THREE.Vector3(), []);
  const q0 = useMemo(() => new THREE.Quaternion(), []);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const at = introAt.current;
    const t = instant ? 99 : at === null ? 0 : nowS() - at - delay;
    o.visible = !hidden && (at === null || instant || t > 0);
    const e = at === null && !instant ? entrance(motion, 0, p.from, p.spin) : entrance(motion, t, p.from, p.spin);
    if (land && !landed.current && e.landed && at !== null && !instant) {
      landed.current = true;
      land.at = nowS();
      land.pos.set(p.pos[0], p.pos[1] + 0.004, p.pos[2]);
    }
    lift.current += ((hover && hoverable ? 0.016 : 0) - lift.current) * Math.min(1, dt * 14);
    base.set(p.pos[0] + e.x, p.pos[1] + e.y + lift.current, p.pos[2] + e.z);
    q0.setFromEuler(new THREE.Euler(e.rx, p.rot + e.ry, e.rz));
    // music mode: the headphones float up beside the camera
    const f = float?.current;
    blend.current += ((f?.on ? 1 : 0) - blend.current) * (1 - Math.exp(-dt * 3.5));
    if (f && blend.current > 0.001) {
      const k = easeInOutCubic(clamp01(blend.current));
      o.position.lerpVectors(base, f.pos, k);
      o.quaternion.slerpQuaternions(q0, f.q, k);
    } else {
      o.position.copy(base);
      o.quaternion.copy(q0);
    }
    o.scale.set(1, e.sy, 1);
  });
  return (
    <group
      ref={g}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!hoverable || !onPick) return;
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (!onPick) return;
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!hoverable || !onPick || e.delta > 6) return;
        e.stopPropagation();
        setHover(false);
        document.body.style.cursor = "";
        onPick();
      }}
    >
      {children}
      {hover && hoverable && label && (
        <Html position={[0, 0.16, 0]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="whitespace-nowrap rounded-full bg-black/45 px-2.5 py-[3px] text-[12px] font-medium text-white backdrop-blur-md">{label}</div>
        </Html>
      )}
    </group>
  );
}

// A soft puff of dust where things land on the desk.
function DustPuffs({ lands }: { lands: Land[] }) {
  const { geo, mat } = useMemo(() => {
    const per = 18;
    const n = lands.length * per;
    const idx = new Float32Array(n);
    const dir = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      idx[i] = Math.floor(i / per);
      const a = Math.random() * Math.PI * 2;
      dir[i * 3] = Math.cos(a);
      dir[i * 3 + 1] = 0.2 + Math.random() * 0.6;
      dir[i * 3 + 2] = Math.sin(a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aIdx", new THREE.BufferAttribute(idx, 1));
    g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...SKY_U,
        uNow: { value: 0 },
        uStart: { value: new Array(8).fill(-99) },
        uPos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
      },
      vertexShader: /* glsl */ `
        attribute float aIdx; attribute vec3 aDir;
        uniform float uNow; uniform float uStart[8]; uniform vec3 uPos[8];
        varying float vA;
        void main(){
          int i = int(aIdx);
          float t = uNow - uStart[i];
          float k = clamp(t / 0.9, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - k, 3.0);
          vec3 p = uPos[i] + vec3(aDir.x * (0.03 + 0.12 * e), aDir.y * 0.035 * e, aDir.z * (0.03 + 0.12 * e));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (t < 0.0 || t > 0.9) ? 0.0 : pow(1.0 - k, 2.0) * 0.45;
          gl_PointSize = (t < 0.0 || t > 0.9) ? 0.0 : (14.0 + 30.0 * e) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uKeyCol; uniform vec3 uSkyCol;
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vA;
          vec3 c = vec3(0.9, 0.86, 0.8) * (uSkyCol + uKeyCol * 0.3);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [lands]);
  useFrame(() => {
    mat.uniforms.uNow.value = nowS();
    lands.forEach((l, i) => {
      mat.uniforms.uStart.value[i] = l.at;
      mat.uniforms.uPos.value[i].copy(l.pos);
    });
  });
  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

// ---------- scene ----------

type SceneApi = { snap: () => string | null; reader: MutableRefObject<ReaderApi | null>; sketch: MutableRefObject<SketchApi | null> };

function Scene({
  mobile,
  reduced,
  skipIntro,
  revealed,
  active,
  mode,
  nav,
  navRef,
  input,
  startRef,
  enterRef,
  exitRef,
  apiRef,
  onStage,
  onMode,
  onProgress,
  onReady,
  onHandoff,
  onReaderInfo,
  onSky,
}: {
  mobile: boolean;
  reduced: boolean;
  skipIntro: boolean;
  revealed: boolean;
  active: boolean;
  mode: Mode;
  nav: "orbit" | "explore";
  navRef: MutableRefObject<{ explore: () => void; back: () => void } | null>;
  input: MutableRefObject<Input>;
  startRef: MutableRefObject<(() => void) | null>;
  enterRef: MutableRefObject<((m: Mode) => void) | null>;
  exitRef: MutableRefObject<(() => void) | null>;
  apiRef: MutableRefObject<SceneApi | null>;
  onStage: (s: Stage) => void;
  onMode: (m: Mode) => void;
  onProgress: (p: number) => void;
  onReady: () => void;
  onHandoff: (t?: UserId) => void;
  onReaderInfo: (i: ReaderInfo) => void;
  onSky: (s: { label: string; night: number; hdr: "day" | "sunset" | "night" }) => void;
}) {
  const { camera, size, gl, scene } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  if (process.env.NODE_ENV !== "production") {
    const w = window as unknown as { __t?: Record<string, number> };
    w.__t = w.__t ?? {};
    w.__t.sceneRender ??= performance.now();
  }
  const cfg = RIG[mobile ? "mobile" : "desktop"];
  const mats = getMats();
  const sw = mobile ? PHONE.aw : MONITOR.aw;
  const sh = mobile ? PHONE.ah : MONITOR.ah;
  const screenMat = useMemo(() => makeScreenMaterial([sw, sh]), [sw, sh]);
  const envSky = useMemo(() => makeSkyMaterial(true), []);
  const screen = useRef<THREE.Mesh | null>(null);
  const introAt = useRef<number | null>(null);
  const instant = reduced || skipIntro;
  const planeApi = useRef<PlaneApi | null>(null);
  const reader = useRef<ReaderApi | null>(null);
  const sketch = useRef<SketchApi | null>(null);
  const [reading, setReading] = useState(false);
  const lands = useMemo<Land[]>(() => Array.from({ length: 6 }, () => ({ at: -99, pos: new THREE.Vector3() })), []);
  const floatRef = useRef<{ on: boolean; pos: THREE.Vector3; q: THREE.Quaternion } | null>({ on: false, pos: new THREE.Vector3(), q: new THREE.Quaternion() });

  const stage = useRef<Stage>("idle");
  const st = useRef(0);
  const handed = useRef(false);
  const rig = useRef({ az: cfg.az, pol: cfg.pol, r: cfg.r, gaz: cfg.az, gpol: cfg.pol, gr: cfg.r });
  const vf = useRef({ yaw: 0, pitch: 0 });
  const v = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(...cfg.target),
      up: new THREE.Vector3(0, 1, 0),
      fromPos: new THREE.Vector3(),
      fromLook: new THREE.Vector3(),
      fromUp: new THREE.Vector3(),
      toPos: new THREE.Vector3(),
      toLook: new THREE.Vector3(),
      toUp: new THREE.Vector3(0, 1, 0),
      sp: new THREE.Vector3(),
      sn: new THREE.Vector3(),
      su: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      tmp: new THREE.Vector3(),
      Y: new THREE.Vector3(0, 1, 0),
    }),
    [cfg],
  );

  // lights driven by the sky clock
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const fog = useMemo(() => new THREE.Fog("#c8c3b8", 20, 170), []);
  const sunTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, DESK.top, 0);
    return o;
  }, []);
  const skyTick = useRef(-1);
  const lastLabel = useRef("");

  useEffect(() => {
    cam.fov = cfg.fov;
    cam.near = 0.01;
    cam.far = 3000;
    cam.updateProjectionMatrix();
  }, [cam, cfg]);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __rig: rig.current, __input: input.current, __cam: cam, __stage: stage, __v: v });
  }, [input, cam, v]);

  // compile everything behind the preloader, then report ready. compileAsync
  // can throw from inside its own polling (a material swapped mid-compile), so
  // compile synchronously, guarded, and always reveal within 6 s regardless.
  useEffect(() => {
    let dead = false;
    let done = false;
    const finish = () => {
      if (dead || done) return;
      done = true;
      onReady();
    };
    const hard = window.setTimeout(finish, 6000);
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __t: Record<string, number> }).__t.effect = performance.now());
    (async () => {
      onProgress(0.4);
      await Promise.race([coverReady(), new Promise((r) => window.setTimeout(r, 2500))]);
      if (dead) return;
      onProgress(0.62);
      await new Promise((r) => window.setTimeout(r, 30));
      try {
        gl.compile(scene, cam);
      } catch {
        /* compile on first draw instead */
      }
      if (dead) return;
      onProgress(0.9);
      let n = 0;
      const tick = () => {
        if (dead) return;
        if (++n < 3) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
    })();
    return () => {
      dead = true;
      window.clearTimeout(hard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (revealed && introAt.current === null) introAt.current = nowS();
  }, [revealed]);

  const setStage = (s: Stage) => {
    stage.current = s;
    st.current = nowS();
    onStage(s);
  };

  // power back to the "off" state after Shut Down: camera pulls out of the glass
  useEffect(() => {
    if (active && stage.current === "done") {
      screenMat.uniforms.uMark.value = 0;
      screenMat.uniforms.uProg.value = 0;
      handed.current = false;
      const r = rig.current;
      r.az = r.gaz = cfg.az;
      r.pol = r.gpol = cfg.pol;
      r.r = r.gr = cfg.r;
      v.fromPos.copy(cam.position);
      v.fromLook.copy(v.look);
      v.fromUp.copy(cam.up);
      input.current.last = performance.now();
      play("shutdown");
      setStage(reduced ? "idle" : "wake");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const screenPose = () => {
    const m = screen.current!;
    m.updateWorldMatrix(true, false);
    m.getWorldPosition(v.sp);
    m.getWorldQuaternion(v.q);
    v.sn.set(0, 0, 1).applyQuaternion(v.q);
    v.su.set(0, 1, 0).applyQuaternion(v.q);
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const aspect = size.width / size.height;
    const visH = Math.min(sh, sw / aspect);
    const cover = visH / (2 * tan);
    const fit = Math.max(sh / (2 * tan * (mobile ? 0.62 : 0.56)), sw / (2 * tan * aspect * 0.74));
    screenMat.uniforms.uPx.value = size.height / visH;
    return { cover, fit };
  };

  const ready = () => instant || (introAt.current !== null && nowS() - introAt.current > INTRO + 1.6);

  // boot (display click)
  startRef.current = () => {
    if (stage.current !== "idle" || !screen.current || !ready()) return;
    document.body.style.cursor = "";
    play("boot");
    if (reduced) {
      setStage("done");
      onHandoff();
      return;
    }
    cam.fov = cfg.fov;
    cam.updateProjectionMatrix();
    v.fromPos.copy(cam.position);
    v.fromLook.copy(v.look);
    v.fromUp.copy(cam.up);
    setStage("approach");
  };

  const layout = LAYOUT[mobile ? "mobile" : "desktop"];
  const planeSpot = PLANE_SPOT[mobile ? "mobile" : "desktop"];
  const place = (k: ObjKind) => layout.find((o) => o.kind === k)!;

  // focus pose for a desk object, written into v.toPos / v.toLook / v.toUp
  const focusPose = (m: Mode) => {
    const aspect = size.width / size.height;
    const tan = Math.tan(THREE.MathUtils.degToRad(cfg.fov) / 2);
    const fitDist = (w: number, h: number) => Math.max(h / (2 * tan * 0.86), w / (2 * tan * aspect * 0.86));
    const P = (k: ObjKind) => {
      const o = place(k);
      return { c: new THREE.Vector3(o.pos[0], DESK.top, o.pos[2]), rot: o.rot };
    };
    const local = (c: THREE.Vector3, rot: number, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyAxisAngle(v.Y, rot).add(c);
    if (m === "piano") {
      const { c, rot } = P("keys");
      const d = fitDist(0.4, 0.2);
      v.toLook.copy(local(c, rot, 0, 0.02, 0.0));
      v.toPos.copy(local(c, rot, 0, 0.03 + d * 0.78, d * 0.62));
      v.toUp.set(0, 1, 0);
    } else if (m === "book" || m === "sketch") {
      const { c, rot } = P(m === "book" ? "book" : "sketchbook");
      const spineX = m === "book" ? -0.0675 : -0.103;
      const w = m === "book" ? 0.29 : 0.44;
      const h = m === "book" ? 0.22 : 0.17;
      const d = fitDist(w, h);
      v.toLook.copy(local(c, rot, spineX, 0.02, 0));
      v.toPos.copy(local(c, rot, spineX, 0.02 + d, d * 0.14));
      v.toUp.set(0, 0, -1).applyAxisAngle(v.Y, rot);
    } else if (m === "camera") {
      const { c, rot } = P("camera");
      const yaw = rot + Math.PI;
      vf.current = { yaw, pitch: 0.04 };
      v.toPos.copy(local(c, rot, -0.006, 0.07, 0.0));
      v.toLook.copy(v.toPos).add(new THREE.Vector3(Math.sin(yaw), 0.04, Math.cos(yaw)));
      v.toUp.set(0, 1, 0);
    }
  };

  const enter = (m: Mode) => {
    if (stage.current !== "idle" || !ready()) return;
    document.body.style.cursor = "";
    if (m === "plane") {
      play("plane");
      planeApi.current?.launch(cam);
      onMode("plane");
      setStage("fly");
      return;
    }
    play(m === "book" ? "page" : "pop", { volume: 0.7 });
    onMode(m);
    if (m === "music") return; // the view stays; the headphones come to you
    v.fromPos.copy(cam.position);
    v.fromLook.copy(v.look);
    v.fromUp.copy(cam.up);
    focusPose(m);
    if (m === "book") setReading(true);
    setStage("focus");
  };
  enterRef.current = enter;

  const exit = () => {
    const s = stage.current;
    if (s === "fly") {
      planeApi.current?.beginLand(cam);
      setStage("land");
      return;
    }
    if (mode === "music") {
      onMode("none");
      play("close", { volume: 0.6 });
      return;
    }
    if (s !== "focus") return;
    play("close", { volume: 0.6 });
    if (mode === "book") {
      reader.current?.close();
    }
    v.fromPos.copy(cam.position);
    v.fromLook.copy(v.look);
    v.fromUp.copy(cam.up);
    input.current.last = performance.now();
    onMode("none");
    setStage("unfocus");
  };
  exitRef.current = exit;

  apiRef.current = {
    snap: () => {
      gl.render(scene, cam);
      try {
        return gl.domElement.toDataURL("image/jpeg", 0.92);
      } catch {
        return null;
      }
    },
    reader,
    sketch,
  };

  // explore: free look + WASD, grab-style drag, wheel/pinch to move
  const ex = useRef({ pos: new THREE.Vector3(), yaw: 0, pitch: 0 });
  navRef.current = {
    explore: () => {
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      ex.current.pos.copy(cam.position);
      ex.current.yaw = Math.atan2(-d.x, -d.z);
      ex.current.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    },
    back: () => {
      if (stage.current !== "idle") return;
      v.fromPos.copy(cam.position);
      v.fromLook.copy(cam.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
      v.fromUp.copy(cam.up);
      input.current.last = performance.now();
      setStage("unfocus");
    },
  };
  const exploreStep = (dt: number) => {
    const e = ex.current;
    const inp = input.current;
    e.yaw += inp.dx * 0.003;
    e.pitch = THREE.MathUtils.clamp(e.pitch + inp.dy * 0.0024, -1.2, 1.2);
    inp.dx = inp.dy = 0;
    const fwd = new THREE.Vector3(-Math.sin(e.yaw) * Math.cos(e.pitch), Math.sin(e.pitch), -Math.cos(e.yaw) * Math.cos(e.pitch));
    const right = new THREE.Vector3(Math.cos(e.yaw), 0, -Math.sin(e.yaw));
    const k = inp.keys;
    const sp = (k.has("shift") ? 7 : 3) * dt;
    if (k.has("w") || k.has("arrowup")) e.pos.addScaledVector(fwd, sp);
    if (k.has("s") || k.has("arrowdown")) e.pos.addScaledVector(fwd, -sp);
    if (k.has("a") || k.has("arrowleft")) e.pos.addScaledVector(right, -sp);
    if (k.has("d") || k.has("arrowright")) e.pos.addScaledVector(right, sp);
    if (k.has("e") || k.has(" ")) e.pos.y += sp;
    if (k.has("q")) e.pos.y -= sp;
    if (inp.zoom) {
      e.pos.addScaledVector(fwd, -inp.zoom * 0.004);
      inp.zoom = 0;
    }
    const r = Math.hypot(e.pos.x, e.pos.z);
    if (r > 60) e.pos.multiplyScalar(60 / r).setY(e.pos.y);
    e.pos.y = THREE.MathUtils.clamp(e.pos.y, 0.5, 25);
    const a = 1 - Math.exp(-dt * 10);
    cam.position.lerp(e.pos, a);
    cam.up.copy(v.Y);
    v.look.copy(cam.position).add(fwd);
    cam.lookAt(v.look);
  };

  // orbit rig home pose, written into v.pos / v.look
  const rigPose = (now: number, dt: number, still = false) => {
    const r = rig.current;
    const inp = input.current;
    if (!still) {
      if (inp.dx || inp.dy) {
        // grab the world: drag right swings the view right
        r.gaz += inp.dx * 0.0034;
        r.gpol += inp.dy * 0.0024;
        inp.dx = inp.dy = 0;
      }
      if (inp.zoom) {
        r.gr *= Math.exp(inp.zoom * 0.0011);
        inp.zoom = 0;
      }
    }
    r.gaz = THREE.MathUtils.clamp(r.gaz, cfg.azMin, cfg.azMax);
    r.gpol = THREE.MathUtils.clamp(r.gpol, cfg.polMin, cfg.polMax);
    r.gr = THREE.MathUtils.clamp(r.gr, cfg.rMin, cfg.rMax);
    const idleFor = (performance.now() - inp.last) / 1000;
    if (!inp.dragging && idleFor > 2.6 && !reduced) {
      const k = 1 - Math.exp(-dt * 0.55);
      r.gaz += (cfg.az + Math.sin(now * 0.09) * 0.07 - r.gaz) * k;
      r.gpol += (cfg.pol + Math.sin(now * 0.063) * 0.012 - r.gpol) * k;
      r.gr += (cfg.r - r.gr) * k;
    }
    const d = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
    r.az += (r.gaz - r.az) * d;
    r.pol += (r.gpol - r.pol) * d;
    r.r += (r.gr - r.r) * d;
    let az = r.az;
    let pol = r.pol;
    let rad = r.r;
    if (!mobile && !inp.dragging && !reduced) {
      az += inp.px * 0.025;
      pol += inp.py * 0.012;
    }
    const [tx, ty, tz] = cfg.target;
    v.pos.set(tx + rad * Math.sin(pol) * Math.sin(az), ty + rad * Math.cos(pol), tz + rad * Math.sin(pol) * Math.cos(az));
    v.look.set(tx, ty, tz);
    // cinematic arrival: from high over the field, looking out at the
    // mountains, the camera eases down onto the desk
    const at = introAt.current;
    if (!instant) {
      const k = at === null ? 0 : clamp01((now - at) / (INTRO + 1.6));
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      v.tmp.set(tx - 5, ty + 15, tz + 24);
      v.pos.lerpVectors(v.tmp, v.pos, e);
      v.pos.y += Math.sin(Math.PI * e) * 1.5;
      const el = Math.pow(e, 1.4);
      v.look.lerpVectors(v.tmp.set(-6, 6, -90), v.look.clone(), el);
    }
  };

  const updateSky = (now: number) => {
    SKY_U.uTime.value = now;
    if (now - skyTick.current < 1 && skyTick.current > 0) return;
    skyTick.current = now;
    const s = skyState(clockHours());
    applySky(s);
    gl.toneMappingExposure = s.exposure;
    fog.color.copy(s.horizon);
    if (sun.current) {
      sun.current.position.copy(s.keyDir).multiplyScalar(6).add(sunTarget.position);
      sun.current.color.copy(s.keyCol);
      sun.current.intensity = s.keyI * 0.85;
    }
    if (hemi.current) {
      hemi.current.color.copy(s.amb).multiplyScalar(1.6);
      hemi.current.groundColor.copy(s.amb).multiply(new THREE.Color(0.5, 0.5, 0.3));
      hemi.current.intensity = 0.9;
    }
    if (fill.current) fill.current.intensity = 0.1 + s.amb.r * 0.6;
    const hdr = s.elev >= 12 ? "day" : s.elev >= -3 ? "sunset" : "night";
    if (s.label + hdr !== lastLabel.current) {
      lastLabel.current = s.label + hdr;
      onSky({ label: s.label, night: s.night, hdr });
    }
  };

  useFrame((_, rawDt) => {
    try {
      frame(rawDt);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") Object.assign(window, { __err: String((err as Error)?.stack ?? err) });
      throw err;
    }
  });

  const frame = (rawDt: number) => {
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __t: Record<string, number> }).__t.frame ??= performance.now());
    const now = nowS();
    const dt = Math.min(rawDt, 0.1);
    updateSky(now);
    const s = stage.current;
    const el = now - st.current;
    const reflect = mats.reflect;

    // display glint once it has settled
    const at = introAt.current;
    if (at !== null && !instant) {
      const tg = now - at - INTRO - 1.25;
      glint.value = tg > 0 && tg < 1.1 ? tg / 1.1 : -1;
    }

    // headphones float target (music mode)
    const f = floatRef.current!;
    f.on = mode === "music";
    if (f.on) {
      const fwd = v.tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      f.pos
        .copy(cam.position)
        .addScaledVector(fwd, 0.62)
        .addScaledVector(right, mobile ? 0.08 : 0.2)
        .addScaledVector(upv, (mobile ? -0.02 : -0.06) + Math.sin(now * 1.3) * 0.008);
      f.q.copy(cam.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2 + Math.sin(now * 0.9) * 0.05, 0.6, 0.1)));
    }

    if (s === "idle" && nav === "explore") {
      exploreStep(dt);
      reflect.opacity = 1;
      if (screen.current) screenPose();
      return;
    }
    if (s === "idle") {
      rigPose(now, dt);
      cam.position.copy(v.pos);
      cam.up.copy(v.Y);
      cam.lookAt(v.look);
      reflect.opacity = 1;
      if (screen.current) screenPose();
      return;
    }
    if (s === "focus" || s === "unfocus") {
      if (s === "unfocus") {
        rigPose(now, dt, true);
        v.toPos.copy(v.pos);
        v.toLook.copy(v.look);
        v.toUp.copy(v.Y);
      } else if (mode === "camera" && el > DUR.focus) {
        // viewfinder: drag to aim
        const inp = input.current;
        vf.current.yaw -= inp.dx * 0.003;
        vf.current.pitch = THREE.MathUtils.clamp(vf.current.pitch + inp.dy * 0.003, -0.5, 0.6);
        inp.dx = inp.dy = 0;
        const { yaw, pitch } = vf.current;
        v.toLook.copy(v.toPos).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)));
      }
      const k = easeInOutCubic(clamp01(el / DUR.focus));
      cam.position.lerpVectors(v.fromPos, v.toPos, k);
      v.look.lerpVectors(v.fromLook, v.toLook, k);
      cam.up.lerpVectors(v.fromUp, v.toUp, k).normalize();
      cam.lookAt(v.look);
      const fovT = mode === "camera" ? 50 : cfg.fov;
      cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
      if (s === "unfocus" && el >= DUR.focus) {
        setReading(false);
        setStage("idle");
      }
      return;
    }
    if (s === "fly") {
      const inp = input.current;
      let sx = inp.sx;
      let sy = inp.sy;
      if (inp.keys.has("a") || inp.keys.has("arrowleft")) sx = -1;
      if (inp.keys.has("d") || inp.keys.has("arrowright")) sx = 1;
      if (inp.keys.has("w") || inp.keys.has("arrowup")) sy = 1;
      if (inp.keys.has("s") || inp.keys.has("arrowdown")) sy = -1;
      planeApi.current?.fly(dt, { sx, sy }, cam);
      return;
    }
    if (s === "land") {
      rigPose(now, dt, true);
      const done = planeApi.current?.land(dt, cam, { pos: v.pos, look: v.look }) ?? true;
      cam.updateProjectionMatrix();
      if (done) {
        cam.fov = cfg.fov;
        cam.updateProjectionMatrix();
        onMode("none");
        input.current.last = performance.now();
        setStage("idle");
      }
      return;
    }
    const pose = screenPose();
    if (s === "approach") {
      const k = easeInOutQuint(clamp01(el / DUR.approach));
      v.toPos.copy(v.sp).addScaledVector(v.sn, pose.fit);
      cam.position.lerpVectors(v.fromPos, v.toPos, k);
      cam.position.y += Math.sin(Math.PI * k) * 0.04;
      v.look.lerpVectors(v.fromLook, v.sp, easeInOutCubic(clamp01(el / (DUR.approach * 0.85))));
      cam.up.lerpVectors(v.fromUp, v.su, k).normalize();
      cam.lookAt(v.look);
      if (el >= DUR.approach) setStage("boot");
    } else if (s === "boot") {
      const pushStart = BOOT_T.total - DUR.push;
      screenMat.uniforms.uMark.value = smooth(clamp01((el - BOOT_T.power) / 0.35));
      screenMat.uniforms.uProg.value = bootProgress(el);
      const k = easeInOutCubic(clamp01((el - pushStart) / DUR.push));
      const dist = THREE.MathUtils.lerp(pose.fit, pose.cover, k);
      reflect.opacity = 1 - smooth(clamp01((el - pushStart) / (DUR.push * 0.8)));
      cam.position.copy(v.sp).addScaledVector(v.sn, dist);
      cam.up.copy(v.su);
      v.look.copy(v.sp);
      cam.lookAt(v.sp);
      if (el >= BOOT_T.total) {
        screenMat.uniforms.uProg.value = 1;
        screenMat.uniforms.uMark.value = 1;
        setStage("done");
      }
    } else if (s === "done") {
      reflect.opacity = 0;
      cam.position.copy(v.sp).addScaledVector(v.sn, pose.cover);
      cam.up.copy(v.su);
      cam.lookAt(v.sp);
      if (!handed.current && el >= DUR.hold) {
        handed.current = true;
        onHandoff();
      }
    } else if (s === "wake") {
      const k = easeInOutCubic(clamp01((el - DUR.wakeDelay) / DUR.wake));
      rigPose(now, dt);
      reflect.opacity = smooth(clamp01((el - DUR.wakeDelay) / 0.9));
      cam.position.lerpVectors(v.fromPos, v.pos, k);
      v.tmp.lerpVectors(v.sp, v.look, easeInOutCubic(clamp01((el - DUR.wakeDelay - 0.15) / (DUR.wake - 0.15))));
      cam.up.lerpVectors(v.su, v.Y, k).normalize();
      cam.lookAt(v.tmp);
      if (el >= DUR.wakeDelay + DUR.wake) setStage("idle");
    }
  };

  const shadowMap = mobile ? 1024 : 2048;
  const idle = stage.current === "idle" && active;
  const order: ObjKind[] = ["keys", "book", "sketchbook", "headphones", "camera"];
  const motionOf: Record<ObjKind, Motion> = { keys: "slide", book: "drop", sketchbook: "slide", headphones: "settle", camera: "drop" };

  const objEl = (o: Placement) => {
    if (o.kind === "keys") return <PianoKeys playable={mode === "piano"} />;
    if (o.kind === "book")
      return <Reader reading={reading && mode === "book"} peekAt={lands[1].at > 0 ? lands[1].at + 0.05 : null} apiRef={reader} onInfo={onReaderInfo} onClosed={() => {}} />;
    if (o.kind === "sketchbook") return <SketchbookLive open={mode === "sketch"} apiRef={sketch} />;
    if (o.kind === "headphones")
      return (
        <>
          <Headphones />
          {mode !== "music" && <HeadphonesBlob />}
        </>
      );
    return <CameraBody />;
  };

  return (
    <>
      <Sky />
      <Mountains mobile={mobile} />
      <Trees />
      <Ground fogDensity={FOG * 0.55} />
      <Lake fogDensity={FOG * 0.7} />
      <Grass mobile={mobile} wind={reduced ? 0.25 : 1} fogDensity={FOG} />
      <Flowers mobile={mobile} wind={reduced ? 0.25 : 1} fogDensity={FOG} />
      <Birds />
      <SkyLife reduced={reduced} />

      {/* the HDRIs load in their own boundary so the scene never waits on them */}
      <Suspense fallback={null}>
        <SkyEnvironment envSky={envSky} />
      </Suspense>
      <primitive object={sunTarget} />
      <directionalLight
        ref={sun}
        target={sunTarget}
        castShadow
        shadow-mapSize={[shadowMap, shadowMap]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.015}
        shadow-camera-left={-1.1}
        shadow-camera-right={1.1}
        shadow-camera-top={1.1}
        shadow-camera-bottom={-1.1}
        shadow-camera-near={1}
        shadow-camera-far={14}
      />
      <hemisphereLight ref={hemi} />
      <directionalLight ref={fill} position={[2.5, 2.2, 3.5]} color="#e6ebf3" intensity={0.3} />

      <Piece p={{ pos: [0, 0, 0], rot: 0, from: [0, -0.9, 0], spin: 0 }} motion="rise" delay={INTRO} introAt={introAt} instant={instant} hoverable={false}>
        <Desk />
      </Piece>
      <Piece
        p={{ pos: [0, 0, 0], rot: 0, from: [0, 0.38, 0], spin: 0 }}
        motion="lower"
        delay={INTRO + 0.3}
        introAt={introAt}
        instant={instant}
        hoverable={idle}
        label={LABELS.display}
        onPick={() => startRef.current?.()}
      >
        {mobile ? <Phone screenMat={screenMat} screenRef={screen} /> : <Monitor screenMat={screenMat} screenRef={screen} />}
      </Piece>
      {order.map((kind, i) => {
        const o = place(kind);
        const from: [number, number, number] =
          motionOf[kind] === "slide" ? [o.from[0] * 0.6, 0, o.from[2] + (kind === "keys" ? 0.35 : 0)] : [o.from[0] * 0.5, 0.42 + i * 0.03, o.from[2] * 0.5];
        return (
          <Piece
            key={kind}
            p={{ pos: [o.pos[0], DESK.top, o.pos[2]], rot: o.rot, from, spin: o.spin }}
            motion={motionOf[kind]}
            delay={INTRO + 0.75 + i * 0.13}
            introAt={introAt}
            instant={instant}
            hoverable={idle && mode === "none"}
            label={LABELS[kind]}
            onPick={() => enter(MODE_OF[kind])}
            land={lands[i]}
            hidden={kind === "camera" && mode === "camera" && stage.current === "focus" && nowS() - st.current > DUR.focus * 0.8}
            float={kind === "headphones" ? floatRef : undefined}
          >
            {objEl(o)}
          </Piece>
        );
      })}
      <Plane spot={planeSpot} apiRef={planeApi} flying={mode === "plane"} onPick={() => enter("plane")} hoverable={idle && mode === "none"} introAt={introAt} introDelay={INTRO + 1.5} instant={instant} />
      {idle && mode === "none" && <PlaneLabel spot={planeSpot} />}
      <DustPuffs lands={lands} />
    </>
  );
}

// "Fly" hint that floats over the paper plane so it's obviously interactive.
function PlaneLabel({ spot }: { spot: { pos: [number, number, number] } }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 3600);
    return () => window.clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <Html position={[spot.pos[0], DESK.top + 0.06, spot.pos[2]]} center style={{ pointerEvents: "none" }} zIndexRange={[15, 0]}>
      <div className="animate-pulse whitespace-nowrap rounded-full bg-white/70 px-2 py-[2px] text-[10px] font-semibold text-black/70 backdrop-blur">Fly ✈︎</div>
    </Html>
  );
}

// Reflections: Poly Haven HDRIs by day and at sunset, our own night sky after dark.
function SkyEnvironment({ envSky }: { envSky: THREE.Material }) {
  const [hdr, setHdr] = useState<"day" | "sunset" | "night">("day");
  useFrame(() => {
    // with a little hysteresis so a sun sitting on a boundary doesn't flicker
    const y = SKY_U.uSunDir.value.y;
    const want = y > (hdr === "day" ? 0.17 : 0.23) ? "day" : y > (hdr === "night" ? -0.02 : -0.08) ? "sunset" : "night";
    if (want !== hdr) setHdr(want);
  });
  if (hdr === "night")
    return (
      <Environment key="night" frames={1} resolution={128} environmentIntensity={0.6}>
        <mesh material={envSky} scale={50}>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      </Environment>
    );
  return (
    <Environment
      key={hdr}
      files={hdr === "day" ? "/assets/polyhaven/kloofendal_48d_partly_cloudy_puresky_1k.hdr" : "/assets/polyhaven/belfast_sunset_puresky_1k.hdr"}
      environmentIntensity={hdr === "day" ? 0.9 : 0.75}
    />
  );
}

// Pollen drifting in daylight, fireflies after dusk.
function SkyLife({ reduced }: { reduced: boolean }) {
  const [night, setNight] = useState(false);
  useFrame(() => {
    const n = SKY_U.uNight.value > 0.5;
    if (n !== night) setNight(n);
  });
  return night ? (
    <Sparkles count={70} scale={[9, 1.1, 9]} position={[0, 0.55, 0.5]} size={3.2} speed={reduced ? 0 : 0.35} opacity={0.9} color="#e4ff8f" noise={1.4} />
  ) : (
    <Sparkles count={80} scale={[4, 1.4, 3]} position={[0, 1.05, 0.2]} size={1.5} speed={reduced ? 0 : 0.18} opacity={0.5} color="#ffe2b0" noise={0.6} />
  );
}

// ---------- room (DOM shell) ----------

export default function Room({
  active,
  introOff,
  reduced,
  isMobile,
  onHandoff,
  onSkip,
}: {
  active: boolean;
  introOff: boolean;
  reduced: boolean;
  isMobile: boolean;
  onHandoff: (t?: UserId) => void;
  onSkip: () => void;
}) {
  const startRef = useRef<(() => void) | null>(null);
  const enterRef = useRef<((m: Mode) => void) | null>(null);
  const exitRef = useRef<(() => void) | null>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const input = useRef<Input>({ dx: 0, dy: 0, zoom: 0, dragging: false, last: 0, px: 0, py: 0, moved: false, sx: 0, sy: 0, keys: new Set() });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const down = useRef({ x: 0, y: 0, pinch: 0 });
  const [stage, setStage] = useState<Stage>("idle");
  const [mode, setMode] = useState<Mode>("none");
  const [nav, setNav] = useState<"orbit" | "explore">("orbit");
  const navRef = useRef<{ explore: () => void; back: () => void } | null>(null);
  const [hours, setHours] = useState(() => clockHours());
  const [liveSky, setLiveSky] = useState(true);
  useEffect(() => {
    if (!liveSky) return;
    const t = window.setInterval(() => setHours(clockHours()), 20000);
    return () => window.clearInterval(t);
  }, [liveSky]);
  const [progress, setProgress] = useState(0.2);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [readerInfo, setReaderInfo] = useState<ReaderInfo>({ spread: 0, spreads: 1, ready: false });
  const [sky, setSky] = useState<{ label: string; night: number; hdr: string }>({ label: "", night: 0, hdr: "day" });
  const [skipIntro] = useState(introOff);
  const [caption, setCaption] = useState<string>();

  useEffect(() => {
    const h = clockHours();
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    setCaption(`Kaunas · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} · ${skyState(h).label}`);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setProgress(1);
    const t = window.setTimeout(() => setRevealed(true), 650);
    return () => window.clearTimeout(t);
  }, [ready]);

  const idle = stage === "idle" && active && revealed && mode === "none";
  const live = active;
  const exit = useCallback(() => exitRef.current?.(), []);

  // keyboard: Esc exits any mode, piano keys, book arrows, flight keys
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "escape") return exit();
      if (mode === "piano" && KEYMAP[k] !== undefined && !e.repeat) {
        strike(KEYMAP[k]);
        return;
      }
      if (mode === "book") {
        if (k === "arrowright") apiRef.current?.reader.current?.next();
        if (k === "arrowleft") apiRef.current?.reader.current?.prev();
      }
      if (mode === "plane" || (nav === "explore" && mode === "none")) {
        input.current.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [mode, exit, nav]);

  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down.current.x = e.clientX;
    down.current.y = e.clientY;
    input.current.moved = false;
    input.current.dragging = true;
    input.current.last = performance.now();
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      down.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const inp = input.current;
    inp.px = (e.clientX / window.innerWidth) * 2 - 1;
    inp.py = (e.clientY / window.innerHeight) * 2 - 1;
    if (mode === "plane" && !isMobile) {
      // the pointer is the stick: distance from centre steers
      const dz = (v: number) => (Math.abs(v) < 0.06 ? 0 : THREE.MathUtils.clamp((v - Math.sign(v) * 0.06) * 1.5, -1, 1));
      inp.sx = dz(inp.px);
      inp.sy = dz(-inp.py);
    }
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === "plane" && isMobile) {
      inp.sx = THREE.MathUtils.clamp((e.clientX - down.current.x) / 90, -1, 1);
      inp.sy = THREE.MathUtils.clamp(-(e.clientY - down.current.y) / 90, -1, 1);
      return;
    }
    if (mode === "sketch") return; // the page takes the pointer
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      inp.zoom += (down.current.pinch - d) * 2.2;
      down.current.pinch = d;
      inp.moved = true;
    } else {
      inp.dx += e.clientX - prev.x;
      inp.dy += e.clientY - prev.y;
      if (!inp.moved && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 6) {
        inp.moved = true;
        setDragging(true);
      }
    }
    inp.last = performance.now();
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (mode === "book" && Math.abs(e.clientX - down.current.x) > 50 && Math.abs(e.clientX - down.current.x) > Math.abs(e.clientY - down.current.y)) {
      if (e.clientX < down.current.x) apiRef.current?.reader.current?.next();
      else apiRef.current?.reader.current?.prev();
    }
    if (pointers.current.size === 0) {
      input.current.dragging = false;
      setDragging(false);
      if (mode === "plane" && isMobile) {
        input.current.sx = 0;
        input.current.sy = 0;
      }
    }
    input.current.last = performance.now();
  };

  const novelApp = () => {
    exit();
    window.setTimeout(() => {
      onHandoff("art");
      window.setTimeout(() => {
        const s = useOS.getState();
        if (isMobile) s.openPhoneApp("novel");
        else s.open("novel");
      }, 300);
    }, 50);
  };

  const orbiting = mode === "none" || mode === "music";
  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{ cursor: mode === "plane" ? "crosshair" : mode !== "none" && mode !== "music" ? "default" : !idle ? "default" : dragging ? "grabbing" : "grab" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) => {
        if (!orbiting) return;
        input.current.zoom += e.deltaY;
        input.current.last = performance.now();
      }}
    >
      <Canvas
        key={isMobile ? "m" : "d"}
        frameloop={live ? "always" : "never"}
        dpr={[1, isMobile ? 1.25 : 1.5]}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: RIG[isMobile ? "mobile" : "desktop"].fov, near: 0.01, far: 3000, position: [0, 1.2, 2.2] }}
        gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.9;
        }}
      >
        <Scene
          mobile={isMobile}
          reduced={reduced}
          skipIntro={skipIntro}
          revealed={revealed}
          active={active}
          mode={mode}
          nav={nav}
          navRef={navRef}
          input={input}
          startRef={startRef}
          enterRef={enterRef}
          exitRef={exitRef}
          apiRef={apiRef}
          onStage={setStage}
          onMode={setMode}
          onProgress={(p) => setProgress((q) => Math.max(q, p))}
          onReady={() => setReady(true)}
          onHandoff={onHandoff}
          onReaderInfo={setReaderInfo}
          onSky={setSky}
        />
      </Canvas>

      {/* warm light leak toward a low sun, and a soft vignette; both gone before the hand-off */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-700"
        style={{
          opacity: stage === "idle" && mode === "none" && sky.hdr === "sunset" ? 1 : 0,
          background: "radial-gradient(55% 60% at 0% 28%, rgb(255 190 125 / 0.28), rgb(255 170 110 / 0.06) 55%, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ opacity: stage === "idle" || mode !== "none" ? 1 : 0, background: "radial-gradient(120% 95% at 50% 45%, transparent 55%, rgb(10 10 14 / 0.3) 100%)" }}
      />

      <div className="pointer-events-none absolute inset-0 transition-opacity duration-500" style={{ opacity: idle ? 1 : 0 }}>
        <div className="absolute left-5 top-5 text-[13px] leading-tight text-white [text-shadow:0_1px_12px_rgb(20_14_8/0.45)]">
          <div className="font-semibold">{owner.name}</div>
          <div className="text-white/70">{owner.role}</div>
        </div>
        <button
          type="button"
          className="pointer-events-auto absolute right-4 top-4 rounded-[8px] px-2.5 py-1 text-[13px] font-medium text-white/80 [text-shadow:0_1px_12px_rgb(20_14_8/0.4)] hov:hover:bg-white/10 hov:hover:text-white"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (idle) onSkip();
          }}
        >
          Skip
        </button>
        <div className="absolute inset-x-0 bottom-8 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-black/30 px-3.5 py-1.5 text-[13px] font-medium text-white backdrop-blur-md">
            <span>{introOff ? (isMobile ? "Tap the phone to power on" : "Click the display to power on") : isMobile ? "Tap the phone to start" : "Click the display to start"}</span>
            <span className="hidden text-white/55 sm:inline">or try anything on the desk</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {revealed && active && mode === "none" && (stage === "idle" || stage === "unfocus") && (
          <NavBar
            key="nav"
            nav={nav}
            onNav={(n) => {
              if (n === "explore") navRef.current?.explore();
              else navRef.current?.back();
              setNav(n);
            }}
            onBack={() => {
              navRef.current?.back();
              setNav("orbit");
            }}
            hours={hours}
            live={liveSky}
            onTime={(h) => {
              setLiveSky(false);
              setHours(h);
              setTimeOverride(h);
            }}
            onLive={() => {
              setLiveSky(true);
              setTimeOverride(null);
              setHours(clockHours());
            }}
            label={`${sky.label || "Live sky"} · drag to look around`}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mode === "piano" && <PianoUI key="piano" onExit={exit} />}
        {mode === "camera" && <CameraUI key="camera" onExit={exit} onShoot={() => apiRef.current?.snap() ?? null} />}
        {mode === "music" && <MusicUI key="music" onExit={exit} />}
        {mode === "book" && (
          <BookUI
            key="book"
            info={readerInfo}
            onExit={exit}
            onPrev={() => apiRef.current?.reader.current?.prev()}
            onNext={() => apiRef.current?.reader.current?.next()}
            onApp={novelApp}
          />
        )}
        {mode === "sketch" && <SketchUI key="sketch" onExit={exit} onClear={() => apiRef.current?.sketch.current?.clear()} onSave={() => apiRef.current?.sketch.current?.save()} />}
        {mode === "plane" && <FlightUI key="plane" onLand={exit} mobile={isMobile} />}
      </AnimatePresence>

      <Preloader progress={progress} done={revealed} caption={progress > 0.5 ? caption : undefined} />
    </div>
  );
}
