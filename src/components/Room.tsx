"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Camera as CameraIcon, Headphones as Headphones2, PenLine, Piano, Power, Send, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import * as THREE from "three";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { owner, type UserId } from "@/content";
import { play } from "@/lib/sfx";
import { DeskDust, type DustApi } from "./scene/Dust";
import { useOS } from "@/store";
import { ambienceMuted, ambienceScene, onAmbienceChange, setAmbienceMuted, startAmbience } from "@/lib/ambience";
import { music, sampleMusic, stopOwner } from "@/lib/audio";
import { flightMusicStop, flightMusicTo, flightMusicVolume } from "@/lib/flightMusic";
import { gyroLook, gyroNudge, gyroStop } from "@/lib/gyro";
import { handoff } from "@/lib/handoff";
import { getQuality, getQualityChoice, reportFrame, setQualityChoice, useQuality, type Quality } from "@/lib/quality";
import { GLASS_SPRING, Glass, GlassStyles } from "./scene/Glass";
import { DeskModel } from "./scene/glb";
import { Flowers, Grass } from "./scene/Grass";
import { CameraBody, Desk, Headphones, HeadphonesBlob, Monitor, Phone, setBlobStrength } from "./scene/models";
import { ContactShadows } from "./scene/home/Contact";
import { Clouds } from "./scene/home/Clouds";
import { Butterflies, Flock, Motes, Skein } from "./scene/home/Life";
import { PropLights, Props } from "./scene/home/Props";
import { Journey } from "./scene/home/JourneyScene";
import { FOREST_K } from "./scene/home/Woods";
import { coverReady, getMats, makeScreenMaterial } from "./scene/materials";
import { BookUI, CameraUI, FlightUI, MusicUI, NavBar, PianoUI, SketchUI } from "./scene/ModeUI";
import { LOADER_T, makeLoaderOverlay } from "./scene/Loader";
import { loader } from "./scene/Overlays";
import { Post, photoCtl, postCtl, type Capture } from "./scene/Post";
import { KEYMAP, PianoKeys, strike } from "./scene/Piano";
import { LOOK_PER_WIDTH, Plane, type FlightInput, type PlaneApi } from "./scene/Plane";
import { Reader, type ReaderApi, type ReaderInfo } from "./scene/Reader";
import { SKETCH_OPEN_SHIFT, SketchbookLive, type SketchApi } from "./scene/Sketch";
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
  skewClock,
  smooth,
  spring,
  type ObjKind,
  type Placement,
} from "./scene/shared";
import { TRACK, geist, geistReady } from "./scene/font";
import { makeLockScreen } from "./scene/lock";
import { SKY_U, applySky, clockHours, setTimeOverride, skyState } from "./scene/sky";
import { Forest } from "./scene/home/Forest";
import { HomeWorld, Worlds } from "./scene/worlds/Worlds";
import { makeArrival } from "./scene/worlds/arrive";
import { KINGS, ORIGIN, WORLDS, gateOf, groundAt, setFlight, swapWorld, useWorld, voyage, voyageBusy, voyageSky, type WorldId } from "./scene/worlds/voyage";
import { Sky, makeSkyMaterial } from "./scene/World";
import { HomeMountains } from "./scene/home/Mountains";
import { Land } from "./scene/home/Terrain";
import { LakeMirror, Reeds } from "./scene/home/Water";
import { CALM, HLAKE, HOLD, SEA, hLakeK, homeLand, landH } from "./scene/home/land";

// The intro: a desk in a field under a live sky (the visitor's local time).
// Everything on the desk does something: the display boots the OS, the piano
// plays, the camera takes photos, the headphones play his music, the novel
// opens and turns its pages, the sketchbook takes a pencil, and the paper
// plane flies. After Shut Down the same scene is the machine's "off" state.

type Stage = "idle" | "approach" | "boot" | "done" | "wake" | "focus" | "unfocus" | "fly" | "land";
export type Mode = "none" | "piano" | "camera" | "music" | "book" | "sketch" | "plane";
type Input = { dx: number; dy: number; zoom: number; dragging: boolean; last: number; px: number; py: number; moved: boolean; sx: number; sy: number; tx: number; ty: number; pinch: number; keys: Set<string>; jx: number; jy: number };

const DUR = { approach: 1.55, push: 1.05, hold: 0.12, wake: 2.3, wakeDelay: 0.35, focus: 1.15 };
const FOG = 0.016;
// The arrival, in seconds from the moment the loader's line becomes the horizon. One unbroken descent:
// the dark lifts on a view from a kilometre up, over the sea, level with the horizon (the loader's line IS that
// horizon), the clouds below and the mountains' heads beyond them; the eye sinks into the cloud (white for a
// breath), comes out under it over glittering water with the coast rushing up, crosses the beach, the meadows
// and the wood, and comes down the last of the field to the desk, slowing all the way. Then the display comes
// down out of the air and lands with weight (a low thud, the frame shakes, dust), each thing on the desk slams
// into its place in turn, the paper plane last and lightest, and only then does the screen light up.
const ARRIVE = 6.4; // the camera reaches its home pose
const SETTLE = ARRIVE - 1.18; // the first of the things on the desk lands
const SLAM_DISPLAY = ARRIVE - 1.58; // the display lands
const SCREEN_ON = ARRIVE - 0.45; // the lock screen begins to glow
// On a phone the descent is shorter, and everything is already in its place on the desk when it comes into view.
const ARRIVE_PHONE = 4.6;
const LOADER_RATE_PHONE = 1.5;
// Where the camera begins, in the orbit rig's own coordinates around the desk: out over the sea to the south,
// a kilometre up, above the lower clouds.
const START = { r: 2300, pol: 1.02, az: 0.1, fov: 9 };
// the cloud it comes down through: how thick the white is at a height (per metre); nothing of it up where it begins
const cloudMist = (y: number) => 0.034 * Math.exp(-(((y - 840) / 105) ** 2));
// How the descent is paced: the share of the way down (in the logarithm of the distance, so the desk grows at an
// even rate) reached at each share of the time. Slow above the clouds while the dark lifts; through the cloud;
// a long second over the sea and the coast; the meadows and the wood; and a long slowing to the desk.
const PACE: [number, number][] = [
  [0, 0],
  [0.15, 0.014],
  [0.25, 0.045],
  [0.33, 0.085],
  [0.42, 0.2],
  [0.56, 0.42],
  [0.69, 0.67],
  [0.81, 0.87],
  [0.92, 0.975],
  [1, 1],
];
// (a monotone cubic through those points: no overshoot, and it comes to rest at the end)
const paceM = (() => {
  const n = PACE.length;
  const d = PACE.slice(1).map((p, i) => (p[1] - PACE[i][1]) / (p[0] - PACE[i][0]));
  const m = PACE.map((_, i) => (i === 0 ? d[0] * 0.5 : i === n - 1 ? 0 : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  return m;
})();
function pace(k: number) {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  let i = 0;
  while (i < PACE.length - 2 && k > PACE[i + 1][0]) i++;
  const [x0, y0] = PACE[i];
  const [x1, y1] = PACE[i + 1];
  const h = x1 - x0;
  const t = (k - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * paceM[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * paceM[i + 1];
}
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __start0: START });

// What three's default loaders are doing (textures, HDRIs), for the loader's line.
const loads = { busy: false, done: 0, total: 0 };
THREE.DefaultLoadingManager.onStart = (_u, d, t) => Object.assign(loads, { busy: true, done: d, total: t });
THREE.DefaultLoadingManager.onProgress = (_u, d, t) => Object.assign(loads, { done: d, total: t });
THREE.DefaultLoadingManager.onLoad = () => (loads.busy = false);
const LABELS: Record<ObjKind | "display" | "plane", string> = { keys: "Piano", camera: "Camera", headphones: "Music", book: "Read", sketchbook: "Sketch", plane: "Fly", display: "Start" };
// how high over each thing its hover tag floats (metres above the desk top)
const TAG_Y: Record<ObjKind, number> = { keys: 0.12, book: 0.12, sketchbook: 0.12, camera: 0.17, headphones: 0.32 };
const MODE_OF: Record<ObjKind, Mode> = { keys: "piano", camera: "camera", headphones: "music", book: "book", sketchbook: "sketch" };

// ---------- load-in motion ----------

// Nothing falls and nothing bounces. The desk and the display are simply there.
// Everything else waits a few centimetres above its place, turned a little, and
// as the camera comes in each one alights: a critically damped fall (it starts
// from rest and never overshoots) with the turn trailing just behind it, its
// real shadow gathering under it as it lands. Each has its own weight.
// `drop`: it falls in from that high and lands hard (`weight` 0..1: how hard the thud, the shake, the dust)
type Settle = { at: number; lift: number; slide?: [number, number]; yaw: number; tilt?: [number, number]; w: number; drop?: number; weight?: number };
type Impact = (weight: number, x: number, y: number, z: number) => void;
const SLAM_FALL = 0.26;

// What takes the pointer for a thing on the desk: boxes that stand still (in the piece's own frame, at rest),
// a little larger than the thing. The thing itself lifts a few millimetres under the pointer, and if it were
// its own hit volume it would lift out from under a pointer resting on its edge, fall back, and lift again,
// every frame. So the hit volume never moves and only the inner group does.
export type Hit = { pos: [number, number, number]; size: [number, number, number]; rot?: [number, number, number] };

function Piece({
  p,
  settle,
  introAt,
  instant,
  hoverable,
  label,
  labelAt = [0, 0.2, 0],
  onPick,
  hidden,
  float,
  onImpact,
  hits,
  hoverLift = 0.006,
  children,
}: {
  p: { pos: [number, number, number]; rot: number };
  settle?: Settle;
  onImpact?: MutableRefObject<Impact | null>;
  introAt: MutableRefObject<number | null>;
  instant: boolean;
  hoverable: boolean;
  label?: string;
  // where the hover tag floats, from the piece's own origin: just clear of the top of the thing
  labelAt?: [number, number, number];
  onPick?: () => void;
  hidden?: boolean;
  float?: MutableRefObject<{ on: boolean; pos: THREE.Vector3; q: THREE.Quaternion } | null>;
  hits?: Hit[];
  hoverLift?: number;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const vis = useRef<THREE.Group>(null);
  const lift = useRef(0);
  const liftV = useRef(0);
  const blend = useRef(0);
  const [hover, setHover] = useState(false);
  const base = useMemo(() => new THREE.Vector3(), []);
  const q0 = useMemo(() => new THREE.Quaternion(), []);
  const eul = useMemo(() => new THREE.Euler(), []);
  const landed = useRef(false);
  // a thing that stops being pickable while the pointer is on it (it was picked, a mode opened) lets go of its hover
  useEffect(() => {
    if (!hoverable) setHover(false);
  }, [hoverable]);
  useFrame((_, rawDt) => {
    const o = g.current;
    if (!o) return;
    const dt = Math.min(rawDt, 0.05);
    // how far from rest: 1 while it waits above the desk, 0 once it has landed
    let r = 0;
    let rr = 0;
    let fall = 0;
    let away = false;
    if (settle && !instant) {
      const at = introAt.current;
      const t = at === null ? -9 : nowS() - at - settle.at;
      if (settle.drop) {
        // out of sight until it falls; it falls faster and faster, lands, gives one small hard bounce and is still
        away = t < -SLAM_FALL;
        const u = clamp01((t + SLAM_FALL) / SLAM_FALL);
        fall = t < 0 ? settle.drop * (1 - u * u) : t < 0.6 ? settle.drop * 0.03 * Math.exp(-t * 10) * Math.abs(Math.sin(t * 24)) : 0;
        rr = t < 0 ? 1 - u * u : t < 0.6 ? 0.05 * Math.exp(-t * 9) * Math.sin(t * 30) : 0;
        if (t < -SLAM_FALL) landed.current = false;
        else if (!landed.current && t >= 0) {
          landed.current = true;
          // (only the first time, and not if it was skipped straight past)
          if (t < 0.25) onImpact?.current?.(settle.weight ?? 0.5, p.pos[0], p.pos[1], p.pos[2]);
        }
      } else {
        r = t > 3 ? 0 : 1 - spring(t, settle.w, 1);
        rr = t > 3 ? 0 : 1 - spring(t - 0.05, settle.w * 0.8, 1);
      }
    }
    o.visible = !hidden && !away;
    // the lift under the pointer: a critically damped spring on the inner group alone (no overshoot, no step,
    // and the hit volume it is judged by stays where it is)
    const want = hover && hoverable ? hoverLift : 0;
    const w = 17;
    liftV.current += (w * w * (want - lift.current) - 2 * w * liftV.current) * dt;
    lift.current += liftV.current * dt;
    if (Math.abs(want - lift.current) < 1e-5 && Math.abs(liftV.current) < 1e-4) {
      lift.current = want;
      liftV.current = 0;
    }
    if (vis.current) vis.current.position.y = lift.current;
    if (settle) {
      base.set(p.pos[0] + (settle.slide?.[0] ?? 0) * r, p.pos[1] + settle.lift * r + fall, p.pos[2] + (settle.slide?.[1] ?? 0) * r);
      q0.setFromEuler(eul.set((settle.tilt?.[0] ?? 0) * rr, p.rot + settle.yaw * rr, (settle.tilt?.[1] ?? 0) * rr));
    } else {
      base.set(p.pos[0], p.pos[1], p.pos[2]);
      q0.setFromEuler(eul.set(0, p.rot, 0));
    }
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
  });
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!hoverable || !onPick) return;
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = "pointer";
  };
  return (
    <group ref={g}>
      <group ref={vis} name={label ? `lift-${label}` : undefined}>{children}</group>
      {onPick && hits && (
        <group
          onPointerOver={over}
          onPointerMove={over}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "";
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            if (!hoverable || e.delta > 6) return;
            e.stopPropagation();
            setHover(false);
            document.body.style.cursor = "";
            onPick();
          }}
        >
          {hits.map((h, i) => (
            <mesh key={i} visible={false} position={h.pos} rotation={h.rot}>
              <boxGeometry args={h.size} />
            </mesh>
          ))}
        </group>
      )}
      {hoverable && label && (
        <Html position={labelAt} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <GlassTag label={label} show={hover} />
        </Html>
      )}
    </group>
  );
}

// The fixed hit volumes of the things on the desk (metres, in each piece's own frame).
const HITS: Record<ObjKind, Hit[]> = {
  keys: [{ pos: [0, 0.019, 0], size: [0.358, 0.042, 0.148] }],
  book: [{ pos: [0, 0.015, 0], size: [0.148, 0.036, 0.218] }],
  sketchbook: [{ pos: [0, 0.015, 0], size: [0.226, 0.036, 0.166] }],
  // (the band is thin and mostly air: the whole silhouette takes the click)
  headphones: [{ pos: [0, 0.1, 0.02], size: [0.2, 0.205, 0.1] }],
  camera: [{ pos: [0.002, 0.041, 0.012], size: [0.142, 0.086, 0.07] }],
};
const HITS_DISPLAY: Hit[] = [
  { pos: [0, MONITOR.y, MONITOR.z], size: [0.635, 0.374, 0.034], rot: [MONITOR.tilt, 0, 0] },
  { pos: [0, DESK.top + 0.1, MONITOR.z - 0.035], size: [0.16, 0.2, 0.17] },
];
// (a phone on a stand is a small thing to hit with a finger: the whole of it and a margin take the tap)
const HITS_PHONE: Hit[] = [{ pos: [0, DESK.top + 0.085, 0], size: [0.13, 0.19, 0.1] }];

// The paper plane's hover, from outside the plane itself: a hit volume fixed at its resting place and a small
// sprung lift of everything inside. (The plane's own hover stepped it 8 mm up in one frame, hit box and all,
// so a pointer at its edge switched it on and off every frame.)
function PlaneHover({ spot, hoverable, onPick, children }: { spot: { pos: [number, number, number]; rot: number }; hoverable: boolean; onPick: () => void; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const hover = useRef(false);
  const y = useRef(0);
  const vy = useRef(0);
  useEffect(() => {
    if (!hoverable) hover.current = false;
  }, [hoverable]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const want = 0; // the plane stays put under the pointer (no lift on hover)
    const w = 15;
    vy.current += (w * w * (want - y.current) - 2 * w * vy.current) * dt;
    y.current += vy.current * dt;
    if (Math.abs(want - y.current) < 1e-5 && Math.abs(vy.current) < 1e-4) {
      y.current = want;
      vy.current = 0;
    }
    if (g.current) g.current.position.y = y.current;
  });
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!hoverable) return;
    e.stopPropagation();
    hover.current = true;
    document.body.style.cursor = "pointer";
  };
  return (
    <>
      <group ref={g} name="lift-Fly">{children}</group>
      <mesh
        visible={false}
        position={[spot.pos[0], DESK.top + 0.034, spot.pos[2]]}
        rotation={[0, spot.rot, 0]}
        onPointerOver={over}
        onPointerMove={over}
        onPointerOut={() => {
          hover.current = false;
          document.body.style.cursor = "";
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!hoverable || e.delta > 6) return;
          e.stopPropagation();
          hover.current = false;
          document.body.style.cursor = "";
          onPick();
        }}
      >
        <boxGeometry args={[0.185, 0.07, 0.265]} />
      </mesh>
    </>
  );
}

const ICONS: Record<string, LucideIcon> = { Piano: Piano, Camera: CameraIcon, Music: Headphones2, Read: BookOpen, Sketch: PenLine, Fly: Send, Start: Power };

// Liquid Glass hover tag: a small capsule with an icon, springing in.
function GlassTag({ label, show }: { label: string; show: boolean }) {
  const I = ICONS[label];
  return (
    <Glass
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 6, scale: show ? 1 : 0.9 }}
      transition={GLASS_SPRING}
      className="flex h-7 items-center gap-1.5 whitespace-nowrap pl-2.5 pr-3 text-[12.5px] font-semibold tracking-[-0.02em]"
    >
      {I && <I size={13} strokeWidth={2.2} />}
      {label}
    </Glass>
  );
}

// ---------- scene ----------

type SceneApi = { skip: () => void; shoot: () => Capture | null; focusAt: (x: number, y: number) => void; reader: MutableRefObject<ReaderApi | null>; sketch: MutableRefObject<SketchApi | null> };

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
  bookSide,
  q,
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
  bookSide: MutableRefObject<{ side: number; k: number }>;
  q: Quality;
}) {
  const { camera, size, gl, scene, advance } = useThree();
  // dev only: a fixed time step and a held viewpoint for frame-by-frame stills
  const dev = useRef<{ dt: number | null; view: { pos: [number, number, number]; look: [number, number, number]; fov?: number; focus?: number } | null }>({ dt: null, view: null });
  const cam = camera as THREE.PerspectiveCamera;
  // dev only: ?post=0..3 pins the lens level whatever Auto decides (the preview pane paints too slowly for Auto)
  const [devPost] = useState<number | null>(() => {
    if (process.env.NODE_ENV === "production") return null;
    const p = new URLSearchParams(window.location.search).get("post");
    return p === null ? null : Math.max(0, Math.min(3, +p || 0));
  });
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
  // idle face: a lock screen with the live time (dark after Shut Down)
  const lock = useMemo(() => makeLockScreen(mobile), [mobile]);
  useEffect(() => {
    screenMat.uniforms.uLock.value = lock.tex;
    return () => lock.dispose();
  }, [lock, screenMat]);
  const lockOn = useRef(skipIntro ? 0 : 1);
  const offRef = useRef(skipIntro);
  const envSky = useMemo(() => makeSkyMaterial(true), []);
  // the land's maps (where the woods are, the shade under each crown, the cloud field), made once before anything reads them
  useMemo(() => homeLand(q.trees), [q.trees]);
  useEffect(() => setBlobStrength(q.effects > 0.2 ? 0.3 : 1), [q.effects]);
  const screen = useRef<THREE.Mesh | null>(null);
  const introAt = useRef<number | null>(null);
  const instant = reduced || skipIntro;
  const planeApi = useRef<PlaneApi | null>(null);
  // a world jumped to from the Worlds list is finished under the closed cloud before it opens (worlds/arrive.ts)
  const arrival = useMemo(() => makeArrival(gl, scene, camera, () => loads.busy), [gl, scene, camera]);
  const reader = useRef<ReaderApi | null>(null);
  const sketch = useRef<SketchApi | null>(null);
  const [reading, setReading] = useState(false);
  // which page of the open spread a phone is reading (0 left, 1 right), and where the eye is between them
  // the loader's in-canvas half, drawn over the finished frame until the dark has lifted
  const ARR = mobile ? ARRIVE_PHONE : ARRIVE;
  const veil = useMemo(() => (instant ? null : makeLoaderOverlay(mobile ? LOADER_RATE_PHONE : 1)), [instant, mobile]);
  const fast = useRef(false);
  const musicVol = useRef(1);
  const gatePhase = useRef<string>("open");
  // the arrival's impacts: a thud, the frame shaken by it, a little dust off the desk where it landed
  const shake = useRef(0);
  const dust = useRef<DustApi | null>(null);
  const impact = useRef<Impact | null>(null);
  impact.current = (w, x, y, z) => {
    play("thud", { volume: w });
    if (!reduced) shake.current = Math.max(shake.current, w);
    dust.current?.burst(x, y + (w >= 1 ? DESK.top : 0), z, w);
  };
  // the flight's input, filled in place each frame (nothing is allocated while flying)
  const flightIn = useRef<FlightInput>({ sx: 0, sy: 0, look: { dx: 0, dy: 0, held: false }, gyro: null });
  useEffect(() => {
    if (!veil) return;
    postCtl.overlay = veil.mat;
    return () => {
      if (postCtl.overlay === veil.mat) postCtl.overlay = null;
      veil.dispose();
    };
  }, [veil]);
  const floatRef = useRef<{ on: boolean; pos: THREE.Vector3; q: THREE.Quaternion } | null>({ on: false, pos: new THREE.Vector3(), q: new THREE.Quaternion() });

  const stage = useRef<Stage>("idle");
  const st = useRef(0);
  const handed = useRef(false);
  const rig = useRef({ az: cfg.az, pol: cfg.pol, r: cfg.r, gaz: cfg.az, gpol: cfg.pol, gr: cfg.r });
  // the camera in the hand: where it is, where it looks (and is turning to), how it is moving
  const ph = useRef({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 });
  // the move into or out of a desk mode: how long it takes and the lens it started with
  const tr = useRef({ dur: DUR.focus, fov0: cfg.fov });
  const par = useRef(0);
  const fling = useRef({ x: 0, y: 0 });
  const introK = useRef(1);
  const landedFov = useRef(false);
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
  const musicClock = useRef(nowS());
  const musicDrift = useRef({ t: 0 });
  const lastH = useRef(-1);
  const lastLabel = useRef("");
  const veilH = useRef(-2);
  const v2 = useMemo(() => new THREE.Vector2(), []);

  useEffect(() => {
    cam.fov = cfg.fov;
    cam.near = 0.01;
    // (the sea runs out to its horizon)
    cam.far = 12000;
    cam.updateProjectionMatrix();
  }, [cam, cfg]);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __three: scene, __rig: rig.current, __input: input.current, __cam: cam, __stage: stage, __v: v, __enter: (m: Mode) => enterRef.current?.(m), __exit: () => exitRef.current?.(), __api: apiRef, __plane: planeApi, __voyage: voyage, __md: musicDrift, __sky: SKY_U, __os: useOS, __start: () => startRef.current?.(), __worlds: { defs: WORLDS, origin: ORIGIN, WORLDS, ORIGIN, gateOf, groundAt }, __q: { get: getQuality, choice: getQualityChoice, set: setQualityChoice, report: reportFrame } });
    if (process.env.NODE_ENV === "production") return;
    // window.__scene: scrub the world deterministically and save stills.
    //   step(seconds, dt)  run the simulation forward in fixed steps (the pane itself only paints ~2 fps)
    //   time(h)            hour of day; fly() / warp(z) / land(); intro(t) seconds into the arrival
    //   view({pos, look, fov, focus}) hold a viewpoint, view(null) to release
    //   shot(name)         POST the finished frame to the local still receiver (scratchpad/save.js)
    const step = (sec: number, dt = 1 / 30) => {
      const n = Math.max(1, Math.round(sec / dt));
      for (let i = 0; i < n; i++) {
        skewClock(dt);
        dev.current.dt = dt;
        advance(performance.now());
      }
      dev.current.dt = null;
      return { stage: stage.current, cam: cam.position.toArray().map((x) => +x.toFixed(2)), plane: planeApi.current?.pos.toArray().map((x) => +x.toFixed(2)) };
    };
    Object.assign(window, {
      __scene: {
        step,
        time: (h: number | null) => setTimeOverride(h),
        fly: () => enterRef.current?.("plane"),
        land: () => exitRef.current?.(),
        warp: (z: number) => planeApi.current?.warp(z),
        // straight into a world (optionally part-way along its path of light, 0..1)
        world: (id: WorldId, along?: number) => planeApi.current?.jump(id, along),
        // t seconds into the arrival; negative is the loader still up (the in-canvas dark and line; __loader.reset() / .set(p) bring back and draw the DOM layer)
        intro: (t: number) => {
          introAt.current = nowS() - t;
          fast.current = false;
          landedFov.current = false;
          if (veil && t < LOADER_T.total / (mobile ? LOADER_RATE_PHONE : 1)) postCtl.overlay = veil.mat;
        },
        view: (o: typeof dev.current.view) => (dev.current.view = o),
        post: postCtl,
        // what one whole frame costs: draw calls and triangles over every pass of the lens
        info: () => {
          gl.info.autoReset = false;
          gl.info.reset();
          advance(performance.now());
          const r = { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0 };
          gl.info.autoReset = true;
          return r;
        },
        shot: async (name: string) => {
          advance(performance.now());
          const url = gl.domElement.toDataURL("image/jpeg", 0.9);
          const blob = await (await fetch(url)).blob();
          await fetch(`http://127.0.0.1:${(window as unknown as { __shotPort?: number }).__shotPort ?? 3998}/?name=${encodeURIComponent(name)}.jpg`, { method: "POST", mode: "no-cors", body: blob });
          return `${name}.jpg ${blob.size}`;
        },
      },
    });
  }, [input, cam, v]);

  // Held from before the first frame: nothing is drawn until the scene's programs are ready (see below).
  useLayoutEffect(() => {
    HOLD.on = true;
    cam.layers.disableAll();
    return () => {
      HOLD.on = false;
      cam.layers.set(0);
    };
  }, [cam]);

  // Behind the loader: wait for the type, the cover and whatever three is
  // still fetching (textures, the sky HDRI), upload every texture, compile
  // every program, draw a few hidden frames, and only then report ready, so
  // nothing hitches once the dark lifts. Each step moves the loader's line.
  // compileAsync can throw from inside its own polling (a material swapped
  // mid-compile), so compile synchronously, guarded; the line itself is a CSS
  // transition and keeps gliding. Always reveal within 9 s regardless.
  useEffect(() => {
    let dead = false;
    let done = false;
    const finish = () => {
      if (dead || done) return;
      done = true;
      // (whatever happened, the world is let go)
      HOLD.on = false;
      cam.layers.set(0);
      onReady();
    };
    const hard = window.setTimeout(finish, 9000);
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const mark = (k: string) => {
      if (process.env.NODE_ENV !== "production") (window as unknown as { __t: Record<string, number> }).__t[k] = performance.now();
    };
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __t: Record<string, number> }).__t.effect = performance.now());
    (async () => {
      onProgress(0.44);
      await Promise.race([Promise.all([coverReady(), lock.ready, geistReady()]), wait(2500)]);
      if (dead) return;
      mark("type");
      onProgress(0.52);
      // files: quiet for two looks in a row, or 4 s at most
      const t0 = performance.now();
      let quiet = 0;
      while (!dead && quiet < 2 && performance.now() - t0 < 4000) {
        quiet = loads.busy ? 0 : quiet + 1;
        if (loads.total > 0) onProgress(0.52 + 0.2 * (loads.done / loads.total));
        await wait(50);
      }
      if (dead) return;
      mark("files");
      onProgress(0.74);
      try {
        const seen = new Set<THREE.Texture>();
        const up = (t: unknown) => {
          const x = t as THREE.Texture;
          if (!x || !x.isTexture || seen.has(x) || (x as THREE.WebGLRenderTarget["texture"]).isRenderTargetTexture) return;
          const im = x.image as { width?: number; complete?: boolean } | null;
          if (!im || !im.width || im.complete === false) return;
          seen.add(x);
          gl.initTexture(x);
        };
        scene.traverse((o) => {
          const ms = (o as THREE.Mesh).material;
          for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) {
            for (const v of Object.values(m)) up(v);
            const us = (m as THREE.ShaderMaterial).uniforms;
            if (us) for (const k in us) up(us[k]?.value);
          }
        });
      } catch {
        /* uploaded on first draw instead */
      }
      mark("textures");
      await wait(30);
      if (dead) return;
      // Every program of the scene is compiled off the main thread (the loader keeps moving, and the drivers build
      // them side by side). The lights are gathered with the camera's layers on, then nothing is drawn again until
      // all of them are ready: a draw would make each finish there and then.
      try {
        cam.layers.set(0);
        const done = gl.compileAsync(scene, cam);
        cam.layers.disableAll();
        await Promise.race([done, wait(7000)]);
      } catch {
        /* compiled on first draw instead */
      }
      cam.layers.set(0);
      HOLD.on = false;
      if (dead) return;
      // One frame of everything, into a small throwaway picture: whatever is hidden now and shown later (the things
      // that land on the desk at the end of the descent, tiles of grass, anything off to one side) has its
      // buffers put on the card and its last program variants made here, behind the loader, not when it first shows.
      try {
        const shown: THREE.Object3D[] = [];
        const kept: THREE.Object3D[] = [];
        scene.traverse((o) => {
          if (!o.visible) {
            shown.push(o);
            o.visible = true;
          }
          if (o.frustumCulled) {
            kept.push(o);
            o.frustumCulled = false;
          }
        });
        const rt = new THREE.WebGLRenderTarget(96, 54, { depthBuffer: true });
        const prev = gl.getRenderTarget();
        gl.shadowMap.needsUpdate = true;
        gl.setRenderTarget(rt);
        gl.render(scene, cam);
        gl.setRenderTarget(prev);
        rt.dispose();
        shown.forEach((o) => (o.visible = false));
        kept.forEach((o) => (o.frustumCulled = true));
      } catch {
        /* first shown, first drawn, as before */
      }
      await wait(0);
      if (dead) return;
      mark("compiled");
      onProgress(0.9);
      // a few hidden frames with everything compiled (a slow tab is not held to all four)
      let n = 0;
      const f0 = performance.now();
      let lastTick = performance.now();
      const tick = () => {
        if (dead) return;
        // (the warming frames are timed too, so a machine that cannot hold this gear is stepped down before the reveal)
        const nowT = performance.now();
        reportFrame((nowT - lastTick) / 1000, false);
        lastTick = nowT;
        // (fourteen frames: the first dozen draw every tile of grass and the mirror once, so their buffers are on the card
        // before the descent needs them; a slow tab is not held to all of them)
        if (++n < 14 && !(n >= 3 && performance.now() - f0 > 1600)) requestAnimationFrame(tick);
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
      offRef.current = true;
      // (the phone's Fly shortcut comes this way too: no power-down sound, and the plane leaves as soon as the desk is there)
      if (!handoff.fly) play("shutdown");
      setStage(reduced ? "idle" : "wake");
      if (reduced && handoff.fly) {
        handoff.fly = false;
        window.setTimeout(() => enterRef.current?.("plane"), 400);
      }
    }
    else if (active && handoff.fly) {
      // (the desk was never left through the glass: the plane simply goes)
      handoff.fly = false;
      window.setTimeout(() => enterRef.current?.("plane"), 500);
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

  const ready = () => instant || (introAt.current !== null && nowS() - introAt.current > ARR);

  // boot (display click)
  startRef.current = () => {
    if (stage.current !== "idle" || !screen.current || !ready()) return;
    document.body.style.cursor = "";
    offRef.current = false;
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

  const lookDir = (yaw: number, pitch: number, out: THREE.Vector3) => out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  // the move into or out of a mode starts here: from this view, with this lens, and a far-off camera is given longer to come home
  const depart = (far = 0) => {
    v.fromPos.copy(cam.position);
    v.fromUp.copy(cam.up);
    tr.current.fov0 = cam.fov;
    tr.current.dur = DUR.focus + Math.min(1.2, far * 0.035);
    const inp = input.current;
    inp.dx = inp.dy = inp.zoom = inp.tx = inp.ty = inp.pinch = 0;
  };

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
      // (the sketchbook slides a little to its right as it opens, to keep its cover on the desk)
      const spineX = m === "book" ? -0.0675 : -0.103 + (mobile ? 0 : SKETCH_OPEN_SHIFT);
      const w = m === "book" ? 0.29 : 0.44;
      const h = m === "book" ? 0.22 : 0.17;
      // on a phone the novel is read a page at a time: one page fills the width, and the eye goes over to the other
      const page = m === "book" && mobile;
      const d = page ? fitDist(0.142, 0.2) : fitDist(w, h);
      const px = page ? spineX + (bookSide.current.k - 0.5) * 0.135 : spineX;
      v.toLook.copy(local(c, rot, px, 0.02, 0));
      v.toPos.copy(local(c, rot, px, 0.02 + d, d * 0.14));
      v.toUp.set(0, 0, -1).applyAxisAngle(v.Y, rot);
    } else if (m === "camera") {
      // pick the camera up: eye height just behind the desk, framed past the
      // display toward the lake and the hills
      const { c } = P("camera");
      const F = ph.current;
      F.yaw = F.tyaw = Math.atan2(0.34, 1);
      F.pitch = F.tpitch = -0.03;
      F.vel.set(0, 0, 0);
      v.toPos.set(c.x + 0.06, DESK.top + 0.6, c.z + 0.62);
      F.pos.copy(v.toPos);
      v.toLook.copy(v.toPos).add(lookDir(F.yaw, F.pitch, v.tmp));
      v.toUp.set(0, 1, 0);
    }
  };

  const enter = (m: Mode) => {
    if (stage.current !== "idle" || !ready()) return;
    document.body.style.cursor = "";
    if (m === "plane") {
      play("plane");
      flightMusicTo("road");
      // only in the air: coming home on the way down must not start the music again
      voyage.onEnter = (id) => {
        if (stage.current === "fly") flightMusicTo(WORLDS[id].music);
      };
      gatePhase.current = "open";
      // (a flight starts in open air, with nowhere picked)
      voyage.landing = false;
      voyage.next = null;
      voyage.phase = "open";
      // flying into the kings' little world is the landing
      voyage.onHome = () => exitRef.current?.();
      planeApi.current?.launch(cam);
      onMode("plane");
      setStage("fly");
      return;
    }
    play(m === "book" ? "page" : "pop", { volume: 0.7 });
    onMode(m);
    if (m === "music") return; // the view stays; the headphones come to you
    depart();
    v.fromLook.copy(v.look);
    focusPose(m);
    if (m === "book") setReading(true);
    setStage("focus");
  };
  enterRef.current = enter;

  const exit = () => {
    const s = stage.current;
    if (s === "fly") {
      gyroStop();
      setFlight({ gyro: false });
      input.current.jx = input.current.jy = 0;
      voyage.onEnter = null;
      voyage.onHome = null;
      // (from here the way is down to the desk: the Worlds list takes no more picks)
      voyage.landing = true;
      planeApi.current?.beginLand(cam);
      if (voyage.homing) {
        // coming home out of the light, the music comes back up, and only then lets go
        flightMusicVolume(1);
        flightMusicTo("home");
        window.setTimeout(() => stage.current !== "fly" && flightMusicStop(7), 17000);
      } else flightMusicStop();
      setStage("land");
      return;
    }
    if (mode === "music") {
      // the music starts fading the moment the headphones go down
      stopOwner("headphones", 0.9);
      onMode("none");
      play("close", { volume: 0.6 });
      return;
    }
    if (s !== "focus") return;
    play("close", { volume: 0.6 });
    if (mode === "book") {
      reader.current?.close();
    }
    depart(Math.max(0, cam.position.distanceTo(v.tmp.set(...cfg.target)) - cfg.rMax));
    v.fromLook.copy(v.look);
    input.current.last = performance.now();
    onMode("none");
    setStage("unfocus");
  };
  exitRef.current = exit;

  apiRef.current = {
    // never a cut: the rest of the arrival simply plays through fast
    skip: () => {
      fast.current = true;
    },
    // the photograph: the framed part of the view, drawn again at twice the page's size (or the screen's own density when that is more)
    shoot: () => {
      // a whole number of pixels per page pixel where it can be, so the frame's edges land on pixel edges
      const cw = Math.max(1, gl.domElement.clientWidth);
      const ch = Math.max(1, gl.domElement.clientHeight);
      const k = Math.min(Math.max(2, Math.ceil(window.devicePixelRatio || 1)), Math.sqrt((mobile ? 5e6 : 9.5e6) / (cw * ch)));
      return postCtl.capture?.(photoCtl.frame, Math.round(cw * k), Math.round(ch * k)) ?? null;
    },
    // tap to focus: how far away is whatever is drawn under that point
    focusAt: (x, y) => {
      const r = gl.domElement.getBoundingClientRect();
      const z = postCtl.depthAt?.((x - r.left) / r.width, 1 - (y - r.top) / r.height);
      if (z == null || !Number.isFinite(z)) return;
      photoCtl.onFocus?.(x - r.left, y - r.top, z);
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
      depart(Math.max(0, cam.position.distanceTo(v.tmp.set(...cfg.target)) - cfg.rMax));
      v.fromLook.copy(cam.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
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

  // The camera in the hand: a free flight over the field. Drag turns the view
  // (the world follows the pointer, as everywhere else), W A S D move, Space
  // rises and Shift sinks (straight up and down, whatever the lens is turned
  // to), E hurries and Q creeps; on touch two fingers slide the world, a pinch
  // walks in or out, and two small buttons by the shutter rise and sink. It
  // leaves from rest and glides back to rest, and the edge of the field, the
  // ground under it and the ceiling over it give instead of stopping it dead.
  const photoFov = () => {
    const f = photoCtl.frame.h > 0.05 ? photoCtl.frame.h : 1;
    return Math.min(104, THREE.MathUtils.radToDeg(2 * Math.atan(photoCtl.sensorH / 2 / photoCtl.focal / f)));
  };
  const photoStep = (dt: number) => {
    const P = ph.current;
    const inp = input.current;
    const turn = 0.0032 * Math.min(1, cam.fov / 46);
    P.tyaw += inp.dx * turn;
    P.tpitch = THREE.MathUtils.clamp(P.tpitch + inp.dy * turn * 0.85, -1.4, 1.4);
    inp.dx = inp.dy = inp.zoom = 0;
    const a = 1 - Math.exp(-dt * 22);
    P.yaw += (P.tyaw - P.yaw) * a;
    P.pitch += (P.tpitch - P.pitch) * a;
    const fwd = lookDir(P.yaw, P.pitch, new THREE.Vector3());
    const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const k = inp.keys;
    const want = v.tmp.set(0, 0, 0);
    if (k.has("w") || k.has("arrowup")) want.add(fwd);
    if (k.has("s") || k.has("arrowdown")) want.sub(fwd);
    if (k.has("d") || k.has("arrowright")) want.add(right);
    if (k.has("a") || k.has("arrowleft")) want.sub(right);
    if (k.has(" ")) want.y += 1;
    if (k.has("shift")) want.y -= 1;
    const moving = want.lengthSq() > 0;
    if (moving) want.normalize().multiplyScalar(k.has("e") ? 6.5 : k.has("q") ? 0.55 : 1.7);
    P.vel.lerp(want, 1 - Math.exp(-dt * (moving ? 5 : 7)));
    P.pos.addScaledVector(P.vel, dt);
    if (inp.tx || inp.ty || inp.pinch) {
      const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * THREE.MathUtils.clamp(photoCtl.focus, 1, 12)) / size.height;
      P.pos.addScaledVector(right, -inp.tx * perPx).addScaledVector(up, inp.ty * perPx).addScaledVector(fwd, inp.pinch * 0.012);
      inp.tx = inp.ty = inp.pinch = 0;
    }
    const r = Math.hypot(P.pos.x, P.pos.z);
    const give = 1 - Math.exp(-dt * 4);
    if (r > 64) {
      const back = ((r - 64) / r) * give;
      P.pos.x -= P.pos.x * back;
      P.pos.z -= P.pos.z * back;
    }
    // never under the ground: the meadow rises and falls away from the desk, and the lake and the sea count as ground
    const ground = Math.max(landH(P.pos.x, P.pos.z), hLakeK(P.pos.x, P.pos.z) < 1.1 ? HLAKE.y : SEA);
    if (P.pos.y < ground + 0.22) P.pos.y += (ground + 0.22 - P.pos.y) * (1 - Math.exp(-dt * 12));
    if (P.pos.y > 36) P.pos.y += (36 - P.pos.y) * give;
    P.pos.y = Math.max(ground + 0.08, P.pos.y);
    cam.position.copy(P.pos);
    cam.up.copy(v.Y);
    v.look.copy(P.pos).add(fwd);
    cam.lookAt(v.look);
  };

  // orbit rig home pose, written into v.pos / v.look
  const rigPose = (now: number, dt: number, still = false) => {
    const r = rig.current;
    const inp = input.current;
    if (!still) {
      const F = fling.current;
      if (inp.dx || inp.dy) {
        // grab the world: what's under the pointer follows it, so dragging
        // right swings the camera left and dragging down lifts it
        r.gaz -= inp.dx * 0.0034;
        r.gpol -= inp.dy * 0.0024;
        // how fast the hand is moving it, for when it lets go
        const k = 1 - Math.exp(-dt * 30);
        F.x += (inp.dx / Math.max(dt, 1e-3) - F.x) * k;
        F.y += (inp.dy / Math.max(dt, 1e-3) - F.y) * k;
        inp.dx = inp.dy = 0;
      } else if (inp.dragging) {
        // held still: nothing to carry on with
        F.x *= Math.exp(-dt * 14);
        F.y *= Math.exp(-dt * 14);
      } else if (Math.abs(F.x) + Math.abs(F.y) > 4) {
        // let go while moving: the world turns on a little way and comes to rest
        r.gaz -= F.x * 0.0034 * dt;
        r.gpol -= F.y * 0.0024 * dt;
        F.x *= Math.exp(-dt * 6.5);
        F.y *= Math.exp(-dt * 6.5);
      }
      if (inp.zoom) {
        r.gr *= Math.exp(inp.zoom * 0.0011);
        inp.zoom = 0;
      }
    }
    // all the way round: the azimuth is free (only the height and the distance are held)
    r.gpol = THREE.MathUtils.clamp(r.gpol, cfg.polMin, cfg.polMax);
    r.gr = THREE.MathUtils.clamp(r.gr, cfg.rMin, cfg.rMax);
    const idleFor = (performance.now() - inp.last) / 1000;
    // the view stays where it was put; only after a long rest does it drift home
    if (!inp.dragging && idleFor > 14 && !reduced) {
      const k = 1 - Math.exp(-dt * 0.55);
      // (home by the shorter way round, however many turns it was given)
      const homeAz = cfg.az + Math.PI * 2 * Math.round((r.gaz - cfg.az) / (Math.PI * 2));
      r.gaz += (homeAz + Math.sin(now * 0.09) * 0.07 - r.gaz) * k;
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
    // pointer parallax: eased out while a drag holds the view and back in
    // after, so neither grabbing nor letting go makes the picture jump
    par.current += ((mobile || reduced || inp.dragging ? 0 : 1) - par.current) * (1 - Math.exp(-dt * (inp.dragging ? 12 : 1.6)));
    az += inp.px * 0.025 * par.current;
    pol += inp.py * 0.012 * par.current;
    const [tx, ty, tz] = cfg.target;
    v.pos.set(tx + rad * Math.sin(pol) * Math.sin(az), ty + rad * Math.cos(pol), tz + rad * Math.sin(pol) * Math.cos(az));
    v.look.set(tx, ty, tz);
    // The arrival. It opens far out and high in the mist, level with the
    // horizon (the loader's line sits exactly on it), and comes down one
    // unbroken arc in the rig's own coordinates: the distance closes in log
    // space, so the desk grows at an even rate, and because the path ends on
    // the live home pose itself there is nothing to hand over when it lands.
    // The eye tips down from the horizon to the desk early, while the desk is
    // still a speck in the haze, and stays on it.
    const at = introAt.current;
    if (!instant) {
      const k = at === null ? 0 : clamp01((now - at) / ARR);
      const u = pace(k);
      if (u < 1) {
        const R = Math.exp(THREE.MathUtils.lerp(Math.log(START.r), Math.log(rad), u));
        const P = THREE.MathUtils.lerp(START.pol, pol, u);
        const A = THREE.MathUtils.lerp(START.az, az, u);
        v.pos.set(tx + R * Math.sin(P) * Math.sin(A), ty + R * Math.cos(P), tz + R * Math.sin(P) * Math.cos(A));
        // level above the clouds; the eye tips down inside the cloud, and comes out of it looking at the coast
        const el = clamp01((k - 0.14) / 0.24);
        const le = el * el * el * (el * (el * 6 - 15) + 10);
        const dx = tx - v.pos.x;
        const dy = ty - v.pos.y;
        const dz = tz - v.pos.z;
        const flat = Math.hypot(dx, dz);
        // pitch only: level at first, then down the line of sight to the desk
        const pitch = Math.atan2(dy, flat) * le;
        const dist = Math.hypot(flat, dy);
        v.look.set(v.pos.x + (dx / flat) * Math.cos(pitch) * dist, v.pos.y + Math.sin(pitch) * dist, v.pos.z + (dz / flat) * Math.cos(pitch) * dist);
      }
      introK.current = u;
    }
  };

  const updateSky = (now: number) => {
    SKY_U.uTime.value = now;
    // While music plays the day leans toward evening and on into night, a slow
    // time-lapse; when it stops the sky eases back to the real hour. The
    // music's energy breathes in the stars, the glow and the light.
    const dtS = Math.min(0.1, Math.max(0, now - musicClock.current));
    musicClock.current = now;
    sampleMusic(dtS);
    const md = musicDrift.current;
    md.t = Math.max(0, md.t + (music.playing ? dtS : -dtS * 5));
    md.t = Math.min(md.t, 90);
    const lean = 1 - Math.exp(-md.t / 22);
    SKY_U.uPulse.value = music.level * 0.7 + music.bass * 0.5;
    let h = clockHours();
    const DUSK = 21.6;
    if (lean > 0.0005 && h > 5 && h < DUSK) h += (DUSK - h) * lean;
    // in flight every world brings its own sky; the change happens behind closed cloud
    const pulsing = SKY_U.uPulse.value > 0.004 || md.t > 0 || voyageBusy();
    if (!pulsing && now - skyTick.current < 1 && skyTick.current > 0 && Math.abs(h - lastH.current) < 0.003) return;
    skyTick.current = now;
    lastH.current = h;
    const s = voyageSky(skyState(h), dtS);
    applySky(s);
    const beat = SKY_U.uPulse.value;
    gl.toneMappingExposure = s.exposure * (1 + beat * 0.07);
    fog.color.copy(s.horizon);
    if (sun.current) {
      sun.current.position.copy(s.keyDir).multiplyScalar(6).add(sunTarget.position);
      sun.current.color.copy(s.keyCol);
      sun.current.intensity = s.keyI * 0.85 * (1 + beat * 0.25);
    }
    if (hemi.current) {
      hemi.current.color.copy(s.amb).multiplyScalar(1.6);
      hemi.current.groundColor.copy(s.amb).multiply(new THREE.Color(0.5, 0.5, 0.3));
      hemi.current.intensity = 0.9;
    }
    // as the day goes, the desk's own fill and the sky it mirrors go down with the field's light, so it stays IN the dusk
    // (while the sunset sky is what it mirrors: after dark it mirrors our own night sky, which is dark already)
    const dayK = s.elev < -3 ? 1 : 0.42 + 0.58 * THREE.MathUtils.smoothstep(s.elev, -3, 7);
    if (fill.current) fill.current.intensity = (0.1 + s.amb.r * 0.6) * (0.4 + 0.6 * THREE.MathUtils.smoothstep(s.elev, -9, 6));
    scene.environmentIntensity = (s.elev >= 12 ? 0.9 : s.elev >= -3 ? 0.75 : 0.6) * (voyage.cur === "home" ? dayK : 1);
    const hdr = s.elev >= 12 ? "day" : s.elev >= -3 ? "sunset" : "night";
    if (s.label + hdr !== lastLabel.current) {
      lastLabel.current = s.label + hdr;
      onSky({ label: s.label, night: s.night, hdr });
    }
  };

  useFrame((_, rawDt) => {
    try {
      frame(dev.current.dt ?? rawDt);
      lens(Math.min(dev.current.dt ?? rawDt, 0.1));
    } catch (err) {
      if (process.env.NODE_ENV !== "production") Object.assign(window, { __err: String((err as Error)?.stack ?? err) });
      throw err;
    }
  });

  // where the lens focuses: on the desk from the orbit, on whatever a mode
  // is looking at, wide open to the land in flight, and nothing soft at all
  // while the display takes over the frame
  const lens = (dt: number) => {
    const s = stage.current;
    let focus = cam.position.distanceTo(v.tmp.set(...cfg.target));
    // after dark the lens stops down: the stars stay points of light
    let dof = 1 - 0.85 * SKY_U.uNight.value;
    let aperture = 2.8;
    let band = 0.3;
    let sensor = 24;
    let look = 1;
    let exposure = 1;
    let photo = false;
    if (s === "fly" || s === "land" || s === "approach" || s === "boot" || s === "done") dof = 0;
    else if (s === "focus") {
      if (mode === "camera") {
        // the camera's own rings: a thin slice in focus, the paint held back
        photo = true;
        focus = photoCtl.focus;
        aperture = photoCtl.aperture;
        band = 0.02;
        sensor = photoCtl.sensorH / (photoCtl.frame.h > 0.05 ? photoCtl.frame.h : 1);
        dof = 1.5;
        look = 0.35;
        exposure = Math.pow(2, photoCtl.ev);
      } else {
        focus = cam.position.distanceTo(v.look);
        dof = 0.9;
      }
    } else if (s === "unfocus" && nav !== "explore") {
      // on the way home the focus stays on what the eye is travelling over, and arrives on the desk with it
      focus = cam.position.distanceTo(v.look);
    } else if ((s === "idle" || s === "unfocus") && nav === "explore") {
      // walking: focused out in the field, only what brushes past the lens goes soft
      focus = 12;
      aperture = 4;
      dof *= 0.8;
    }
    // a phone has depth of field only while the camera is held: it fades with the way home
    if (postCtl.photo && !photo && s === "unfocus" && postCtl.level < 2) {
      photo = postCtl.dof > 0.02;
      dof = 0;
    }
    const d = dev.current.view;
    if (d) {
      cam.position.set(...d.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(...d.look);
      if (d.fov) {
        cam.fov = d.fov;
        cam.updateProjectionMatrix();
      }
      dof = d.focus ? 1 : 0;
      focus = d.focus ?? focus;
    }
    const e = 1 - Math.exp(-dt * 5);
    // focus is pulled in stops, not metres: near and far take the same time
    postCtl.focus = Math.exp(Math.log(postCtl.focus) + (Math.log(Math.max(0.05, focus)) - Math.log(postCtl.focus)) * (1 - Math.exp(-dt * 6)));
    postCtl.dof += (dof - postCtl.dof) * (1 - Math.exp(-dt * (dof < postCtl.dof ? 7 : 2.5)));
    postCtl.aperture += (aperture - postCtl.aperture) * e;
    postCtl.band += (band - postCtl.band) * e;
    postCtl.sensor += (sensor - postCtl.sensor) * e;
    postCtl.look += (look - postCtl.look) * e;
    postCtl.exposure += (exposure - postCtl.exposure) * e;
    postCtl.photo = photo;
  };

  const frame = (rawDt: number) => {
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __t: Record<string, number> }).__t.frame ??= performance.now());
    const now = nowS();
    const dt = Math.min(rawDt, 0.1);
    updateSky(now);
    // Auto quality listens to the real frame time while the scene is simply being looked at or flown through
    if (stage.current === "idle" || stage.current === "fly") reportFrame(rawDt, stage.current !== "fly");
    const flying = stage.current === "fly";
    const lk = hLakeK(cam.position.x, cam.position.z);
    const wdef = WORLDS[voyage.cur];
    ambienceScene({
      night: SKY_U.uNight.value,
      water: voyage.cur === "home" ? clamp01(1 - (lk - 1) / 2.5) * 0.8 : wdef.water !== null ? 0.5 : 0,
      speed: flying ? (planeApi.current?.speed() ?? 0) : 0,
      boost: flying ? (planeApi.current?.boost() ?? 0) : 0,
      // the avenue is a wood; every painted world has a bed of its own
      place: voyage.cur === "home" ? (voyage.flying && cam.position.z < -46 ? "forest" : "meadow") : wdef.place,
      world: voyage.cur,
    });
    // a soft rush of air as the plane goes through a gate into cloud, and a softer one as the cloud opens on the next world
    if (flying && voyage.phase !== gatePhase.current) {
      if (voyage.phase === "closing") play("whoosh", { volume: 0.9 });
      else if (voyage.phase === "opening") play("whoosh", { volume: 0.5 });
      gatePhase.current = voyage.phase;
    }
    // the kings' wood grows quiet: the music sinks as the plane nears the light they hold
    if (flying) {
      let vol = 1;
      if (voyage.cur === "kings" && !voyage.homing && planeApi.current) {
        const pp = planeApi.current.pos;
        const d = Math.hypot(pp.x - ORIGIN.x, pp.z - ORIGIN.z - KINGS.z);
        vol = 0.1 + 0.6 * smooth(clamp01((d - 90) / 520));
      }
      if (Math.abs(vol - musicVol.current) > 0.01) flightMusicVolume((musicVol.current = vol));
    } else musicVol.current = 1;
    const s = stage.current;
    const el = now - st.current;
    const reflect = mats.reflect;

    // a click during the arrival plays the rest of it through at speed
    const at0 = introAt.current;
    if (fast.current && at0 !== null) {
      if (now - at0 < ARR + 1) introAt.current = at0 - dt * 7;
      else fast.current = false;
    }
    // arrival mist thins out, continuously, as the camera comes down
    const at = introAt.current;
    const mist = instant || (at !== null && now - at > ARR) ? 0 : cloudMist(cam.position.y);
    // (and in the journey's forest, its fog: so the gate's veil and the path of light go into it with the land)
    SKY_U.uMist.value = Math.max(mist, voyage.mist, FOREST_K.fog.value * 0.0105);
    // The lens's near plane. A centimetre at the desk (things there are looked at from a hand's breadth), but with a
    // centimetre the depth a kilometre off is good to no better than six metres: seen from the sky, the mountains'
    // feet, the far woods and the sea all flickered against the land under them. So it moves out with the eye's
    // distance from the desk, to metres when the eye is high. (In flight the plane sets its own.)
    // (the two shadow passes take turns while nothing is happening: see CALM)
    CALM.frame++;
    CALM.on = stage.current === "idle" && !voyage.flying && at !== null && now - at > ARR + 3;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = !CALM.on || (CALM.frame & 1) === 1;
    if (!voyage.flying) {
      const dd = Math.hypot(cam.position.x, cam.position.y - 1, cam.position.z);
      const near = dd < 6 ? 0.01 : Math.min(8, 0.01 + (dd - 6) * 0.01);
      if (Math.abs(cam.near - near) > near * 0.02) {
        cam.near = near;
        cam.updateProjectionMatrix();
      }
    }
    // the plain three fog (the desk and its things) keeps pace with the shader fog
    fog.far = Math.min(176, 3 / (FOG + mist));
    fog.near = fog.far * (20.5 / 176);
    // the loader's dark, line and first light, over the finished frame
    if (veil && postCtl.overlay === veil.mat) {
      if (lastH.current >= 0 && veilH.current !== lastH.current) {
        veilH.current = lastH.current;
        veil.tint(skyState(lastH.current));
      }
      if (!veil.update(at === null ? -1 : now - at, cam, size, gl.getDrawingBufferSize(v2))) postCtl.overlay = null;
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

    // lock screen fades in once the display has settled; off while booting,
    // and dark after Shut Down until the next boot
    const lockTarget = (s === "idle" || s === "focus" || s === "unfocus" || s === "fly" || s === "land") && !offRef.current ? 1 : 0;
    lockOn.current += (lockTarget - lockOn.current) * Math.min(1, dt * (lockTarget ? 1.5 : 6));
    // the display is already on its lock screen when it comes into view
    // (in the arrival the display is dark until everything has landed, then its glass lights up)
    const atS = introAt.current;
    const screenUp = instant || mobile || atS === null ? 1 : smooth(clamp01((now - atS - SCREEN_ON) / 0.5));
    screenMat.uniforms.uLockMix.value = lockOn.current * screenUp;
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
      // an impact shakes the frame: a few millimetres, fast, gone in a third of a second
      if (shake.current > 0.002) {
        const k = shake.current * shake.current * 0.009;
        cam.position.x += (Math.sin(now * 91) * 0.6 + Math.sin(now * 147 + 1.3) * 0.4) * k;
        cam.position.y += (Math.sin(now * 113 + 0.7) * 0.6 + Math.sin(now * 171) * 0.4) * k;
        cam.lookAt(v.look);
        shake.current *= Math.exp(-dt * 9);
      } else shake.current = 0;
      // a wider lens up high, closing as it lands
      if (!instant && !landedFov.current) {
        cam.fov = cfg.fov + START.fov * (1 - introK.current);
        cam.updateProjectionMatrix();
        landedFov.current = introK.current >= 1;
      }
      reflect.opacity = 1;
      if (screen.current) screenPose();
      return;
    }
    if (s === "focus" || s === "unfocus") {
      const T = tr.current;
      let fovT = cfg.fov;
      if (s === "focus" && mode === "book" && mobile) {
        const B = bookSide.current;
        B.k += (B.side - B.k) * (1 - Math.exp(-dt * 7));
        focusPose("book");
      }
      if (s === "unfocus") {
        if (nav === "explore") {
          // put down while exploring: back to where the walk was left
          v.toPos.copy(ex.current.pos);
          v.toLook.copy(v.toPos).add(lookDir(ex.current.yaw, ex.current.pitch, v.tmp));
        } else {
          rigPose(now, dt, true);
          v.toPos.copy(v.pos);
          v.toLook.copy(v.look);
        }
        v.toUp.copy(v.Y);
      } else if (mode === "camera") {
        fovT = photoFov();
        if (el >= T.dur) {
          photoStep(dt);
          cam.fov += (fovT - cam.fov) * (1 - Math.exp(-dt * 9));
          cam.updateProjectionMatrix();
          return;
        }
        input.current.dx = input.current.dy = 0;
      }
      const k = easeInOutCubic(clamp01(el / T.dur));
      cam.position.lerpVectors(v.fromPos, v.toPos, k);
      v.look.lerpVectors(v.fromLook, v.toLook, k);
      cam.up.lerpVectors(v.fromUp, v.toUp, k).normalize();
      cam.lookAt(v.look);
      cam.fov = THREE.MathUtils.lerp(T.fov0, fovT, k);
      cam.updateProjectionMatrix();
      if (s === "unfocus" && el >= T.dur) {
        // nothing dragged or scrolled inside a mode carries over into the orbit
        const inp = input.current;
        inp.dx = inp.dy = inp.zoom = inp.tx = inp.ty = inp.pinch = 0;
        setReading(false);
        setStage("idle");
      }
      return;
    }
    if (s === "fly") {
      const inp = input.current;
      // the pointer (or a finger) is the stick; A / D bank, W / S (and Space) climb and dive, Shift and E open the
      // throttle, Ctrl and Q close it (the slider works it too; the wheel is the lens's zoom).
      // With Follow the path on there is no stick (the mouse only looks, by dragging): the plane flies the path
      // through every gate, and the keys nudge it aside for as long as they are held.
      // (on a phone the stick is the glass one under the left thumb, and a drag anywhere else turns the eye)
      const k = inp.keys;
      const auto = mobile || voyage.guide;
      let sx = mobile ? inp.jx : 0; // (with a mouse the pointer is never a stick: the keys fly the plane, the mouse only looks)
      const bank = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
      if (bank) sx = bank;
      const thr = (k.has("shift") || k.has("e") ? 1 : 0) - (k.has("control") || k.has("q") ? 1 : 0);
      const climb = (k.has("w") || k.has("arrowup") || k.has(" ") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
      // a drag is measured in screen widths, so the same sweep turns the eye as far on any screen
      const W = Math.max(320, window.innerWidth);
      // with the phone as the eye a drag moves what "straight ahead" is
      const g = voyage.gyro ? gyroLook() : null;
      if (g && (inp.dx || inp.dy)) gyroNudge((-inp.dx / W) * LOOK_PER_WIDTH, (-inp.dy / W) * LOOK_PER_WIDTH * 0.8);
      const fi = flightIn.current;
      fi.sx = sx;
      fi.sy = mobile ? inp.jy : 0;
      fi.thr = thr;
      fi.climb = climb;
      fi.wheel = inp.zoom;
      fi.moved = inp.last;
      fi.keys = mobile || bank !== 0 || climb !== 0;
      fi.soft = mobile;
      fi.auto = auto;
      fi.look!.dx = inp.dx / W;
      fi.look!.dy = inp.dy / W;
      fi.look!.held = inp.dragging;
      fi.gyro = g;
      arrival();
      planeApi.current?.fly(dt, fi, cam);
      inp.zoom = inp.dx = inp.dy = 0;
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
      if (el >= DUR.wakeDelay + DUR.wake) {
        setStage("idle");
        if (handoff.fly) {
          handoff.fly = false;
          enter("plane");
        }
      }
    }
  };

  const shadowMap = Math.min(q.shadows || 512, mobile ? 1024 : 4096);
  const idle = stage.current === "idle" && active;
  // The keys lead from the centre and the rest follow outward, the gaps
  // closing as they go; the paper plane is last and lightest. Under a second
  // from the first leaving its wait to the last at rest.
  const settleOf: Record<ObjKind, Settle> = {
    keys: { at: SETTLE, lift: 0, yaw: 0.05, tilt: [0.08, 0], w: 8, drop: 0.55, weight: 0.7 },
    book: { at: SETTLE + 0.13, lift: 0, yaw: -0.2, tilt: [0, 0.06], w: 9, drop: 0.5, weight: 0.55 },
    sketchbook: { at: SETTLE + 0.24, lift: 0, yaw: 0.16, tilt: [0.05, 0], w: 9, drop: 0.48, weight: 0.45 },
    headphones: { at: SETTLE + 0.35, lift: 0, yaw: 0.3, tilt: [-0.08, 0.05], w: 8.5, drop: 0.6, weight: 0.6 },
    camera: { at: SETTLE + 0.45, lift: 0, yaw: -0.25, tilt: [0.06, -0.06], w: 9.5, drop: 0.52, weight: 0.55 },
  };
  const displaySettle: Settle = { at: SLAM_DISPLAY, lift: 0, yaw: 0.12, tilt: [-0.1, 0.04], w: 8, drop: 1.4, weight: 1 };

  const objEl = (o: Placement) => {
    if (o.kind === "keys")
      return (
        <DeskModel name="keyboard">
          <PianoKeys playable={mode === "piano"} />
        </DeskModel>
      );
    // on the phone's small desk the novel and the sketchbook lie against each other: whichever is opened, the other is lifted out of its way
    if (o.kind === "book")
      return (
        <Held away={mobile && mode === "sketch"}>
          <Reader reading={reading && mode === "book"} peekAt={null} apiRef={reader} onInfo={onReaderInfo} onClosed={() => {}} />
        </Held>
      );
    if (o.kind === "sketchbook")
      return (
        <Held away={mobile && (mode === "book" || reading)}>
          <SketchbookLive open={mode === "sketch"} shift={mobile ? 0 : SKETCH_OPEN_SHIFT} apiRef={sketch} />
        </Held>
      );
    if (o.kind === "headphones")
      return (
        <>
          <DeskModel name="headphones">
            <Headphones />
          </DeskModel>
          {mode !== "music" && <HeadphonesBlob />}
        </>
      );
    return (
      <Held away={mode === "camera"}>
        <DeskModel name="camera">
          <CameraBody />
        </DeskModel>
      </Held>
    );
  };

  return (
    <>
      <Sky />
      {/* the desk's own field: not drawn while the plane is away in another world */}
      <HomeWorld>
        <HomeMountains mobile={mobile} />
        <Clouds mobile={mobile} amount={q.effects < 0.5 ? 0.5 : q.effects < 1 ? 0.7 : 1} />
        <Forest amount={q.trees} mobile={mobile} />
        <Land mobile={mobile} />
        <Reeds mobile={mobile} />
        {!mobile && q.effects > 0.5 && <LakeMirror quality={q.effects} />}
        <Grass mobile={mobile} wind={reduced ? 0.25 : 1} fogDensity={FOG} density={q.grass} />
        <Flowers mobile={mobile} wind={reduced ? 0.25 : 1} fogDensity={FOG} />
        <Flock />
        <Props />
        <PropLights />
        {/* the opening flight: the town on the river, the old forest, the cave in the mountain (home/journey.ts) */}
        <Journey mobile={mobile} trees={q.trees} effects={q.effects} />
        {q.effects > 0.2 && <Butterflies count={mobile ? 20 : 46} />}
        <Skein />
      </HomeWorld>
      {/* the path of light, the gate, and whichever painted world the plane is in */}
      <Worlds mobile={mobile} effects={q.effects} trees={q.trees} far={q.far} grass={q.grass} reduced={reduced} />
      <SkyLife reduced={reduced} amount={q.effects} />

      {/* the HDRIs load in their own boundary so the scene never waits on them */}
      <Suspense fallback={null}>
        <SkyEnvironment envSky={envSky} />
      </Suspense>
      <primitive object={sunTarget} />
      <directionalLight
        ref={sun}
        target={sunTarget}
        castShadow={q.shadows > 0}
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

      {/* the desk and the display are there from the first frame, the lock screen lit */}
      <Piece p={{ pos: [0, 0, 0], rot: 0 }} introAt={introAt} instant={instant} hoverable={false}>
        <Desk />
      </Piece>
      <Piece
        p={{ pos: [0, 0, 0], rot: 0 }}
        settle={mobile ? undefined : displaySettle}
        onImpact={impact}
        introAt={introAt}
        instant={instant}
        hoverable={idle}
        label={LABELS.display}
        labelAt={mobile ? [0, DESK.top + 0.215, 0] : [0, MONITOR.y + MONITOR.h / 2 + 0.06, MONITOR.z]}
        onPick={() => startRef.current?.()}
        hits={mobile ? HITS_PHONE : HITS_DISPLAY}
        hoverLift={0}
      >
        {mobile ? (
          <Phone screenMat={screenMat} screenRef={screen} />
        ) : (
          <DeskModel name="display">
            <Monitor screenMat={screenMat} screenRef={screen} />
          </DeskModel>
        )}
      </Piece>
      {(Object.keys(settleOf) as ObjKind[]).map((kind) => {
        const o = place(kind);
        return (
          <Piece
            key={kind}
            p={{ pos: [o.pos[0], DESK.top, o.pos[2]], rot: o.rot }}
            settle={settleOf[kind]}
            onImpact={impact}
            introAt={introAt}
            instant={instant || mobile}
            hoverable={idle && mode === "none"}
            label={LABELS[kind]}
            labelAt={[0, TAG_Y[kind], 0]}
            onPick={() => enter(MODE_OF[kind])}
            hits={HITS[kind]}
            float={kind === "headphones" ? floatRef : undefined}
          >
            {objEl(o)}
          </Piece>
        );
      })}
      <PlaneHover spot={planeSpot} hoverable={idle && mode === "none"} onPick={() => enter("plane")}>
        <Plane spot={planeSpot} apiRef={planeApi} flying={mode === "plane"} onPick={() => {}} hoverable={false} introAt={introAt} introDelay={SETTLE + 0.62} instant={instant || mobile} />
      </PlaneHover>
      <DeskDust apiRef={dust} />
      {q.effects > 0.2 && <ContactShadows />}
      {idle && mode === "none" && <PlaneLabel spot={planeSpot} introAt={introAt} instant={instant} after={ARR + 2.2} />}
      <Post level={devPost ?? (mobile ? Math.min(1, q.post) : q.post)} />
    </>
  );
}

// Something taken off the desk into the hand: it lifts and is gone, and is set
// back down the same way, so the desk never shows it popping in or out.
function Held({ away, children }: { away: boolean; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const k = useRef(1);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    k.current += ((away ? 0 : 1) - k.current) * (1 - Math.exp(-Math.min(dt, 0.1) * (away ? 9 : 6)));
    const e = clamp01(k.current);
    o.visible = e > 0.004;
    o.scale.setScalar(Math.max(0.001, e));
    o.position.y = (1 - e) * 0.07;
  });
  return <group ref={g}>{children}</group>;
}

// "Fly" hint that floats over the paper plane so it's obviously interactive.
function PlaneLabel({ spot, introAt, instant, after }: { spot: { pos: [number, number, number] }; introAt: MutableRefObject<number | null>; instant: boolean; after: number }) {
  const [show, setShow] = useState(false);
  // only once the desk has long settled, and it eases in like every other tag
  useFrame(() => {
    if (show) return;
    const at = introAt.current;
    if (instant ? nowS() - mountedAt.current > 1.5 : at !== null && nowS() - at > after) setShow(true);
  });
  const mountedAt = useRef(nowS());
  return (
    <Html position={[spot.pos[0], DESK.top + 0.1, spot.pos[2]]} center style={{ pointerEvents: "none" }} zIndexRange={[15, 0]}>
      <GlassTag label="Fly" show={show} />
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

// Pollen drifting in daylight, fireflies after dusk (see scene/home/Life: soft round motes that the scene can hide).
function SkyLife({ reduced, amount }: { reduced: boolean; amount: number }) {
  const id = useWorld();
  if (id !== "home") return null;
  return <Motes count={Math.round(70 + 170 * amount)} still={reduced} />;
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
  const input = useRef<Input>({ dx: 0, dy: 0, zoom: 0, dragging: false, last: 0, px: 0, py: 0, moved: false, sx: 0, sy: 0, tx: 0, ty: 0, pinch: 0, keys: new Set(), jx: 0, jy: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const down = useRef({ x: 0, y: 0, pinch: 0 });
  const [stage, setStage] = useState<Stage>("idle");
  const stageRef = useRef<Stage>("idle");
  stageRef.current = stage;
  const [mode, setMode] = useState<Mode>("none");
  const modeRef = useRef<Mode>("none");
  modeRef.current = mode;
  const [nav, setNav] = useState<"orbit" | "explore">("orbit");
  const navRef = useRef<{ explore: () => void; back: () => void } | null>(null);
  const [hours, setHours] = useState(() => clockHours());
  const [liveSky, setLiveSky] = useState(true);
  useEffect(() => {
    if (!liveSky) return;
    const t = window.setInterval(() => setHours(clockHours()), 20000);
    return () => window.clearInterval(t);
  }, [liveSky]);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [readerInfo, setReaderInfo] = useState<ReaderInfo>({ spread: 0, spreads: 1, ready: false });
  const [sky, setSky] = useState<{ label: string; night: number; hdr: string }>({ label: "", night: 0, hdr: "day" });
  const [skipIntro] = useState(introOff);
  const q = useQuality();
  const [hidden, setHidden] = useState(false);
  const [quiet, setQuiet] = useState(ambienceMuted);
  useEffect(() => onAmbienceChange(() => setQuiet(ambienceMuted())), []);
  // nothing is drawn while the tab is in the background
  useEffect(() => {
    const v = () => setHidden(document.visibilityState !== "visible");
    v();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);
  useEffect(() => ambienceScene({ active }), [active]);
  // a phone hears only a very soft wind: no birds, no water, no piano notes
  useEffect(() => ambienceScene({ minimal: isMobile }), [isMobile]);
  // The layout changes between the wide desk and the phone's (a window dragged narrow, a tablet turned): the scene
  // is built afresh for it and starts at the desk. Whatever was in the hand is put down with it, and a flight is
  // over; otherwise the controls of a mode stayed up over a scene that was no longer in it, and a flight left the
  // desk standing in a world that was not drawn.
  const layout = useRef(isMobile);
  useEffect(() => {
    if (layout.current === isMobile) return;
    layout.current = isMobile;
    if (modeRef.current === "plane") flightMusicStop();
    if (modeRef.current === "music") stopOwner("headphones", 0.6);
    gyroStop();
    setFlight({ gyro: false });
    Object.assign(voyage, { flying: false, landing: false, homing: false, next: null, phase: "open", veil: 0, mist: 0, warm: 0, assist: 0, onEnter: null, onHome: null });
    swapWorld("home");
    postCtl.flight.k = 0;
    input.current.keys.clear();
    setStage("idle");
    setLiveSky(true);
    setTimeOverride(null);
    setHours(clockHours());
    setNav("orbit");
    setMode("none");
  }, [isMobile]);
  // the room going away (or being rebuilt by a hot reload) takes its music with it
  useEffect(
    () => () => {
      flightMusicStop();
      stopOwner("headphones", 0.6);
    },
    [],
  );

  // the 3D chunk has arrived
  useEffect(() => loader.set(0.34), []);

  useEffect(() => {
    if (!ready) return;
    loader.set(1);
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __t: Record<string, number> }).__t.ready = performance.now());
    // the line finishes drawing before anything opens, and the loader is never
    // a flash: at least 1.3 s from navigation even when everything is cached
    // (a short breath once everything is ready, so the invitation does not snap in; no longer two thirds of a second)
    const minWait = Math.max(280, 1100 - performance.now());
    // A returning visitor, or one who asked for less motion, goes straight in. Otherwise the line is across and it
    // waits for one click (or key, or tap): the arrival has sound, and sound may only begin with a gesture. If no
    // one clicks it goes in on its own after a while, silently.
    if (skipIntro || reduced) {
      const t = window.setTimeout(() => setRevealed(true), minWait);
      return () => window.clearTimeout(t);
    }
    let go = false;
    const enter = () => {
      if (go) return;
      go = true;
      startAmbience();
      loader.ask(null);
      setRevealed(true);
    };
    const t0 = window.setTimeout(() => {
      loader.ask(isMobile ? "Tap to enter" : "Click to enter");
      window.addEventListener("pointerdown", enter, { once: true });
      window.addEventListener("keydown", enter, { once: true });
    }, minWait);
    const t1 = window.setTimeout(enter, minWait + 14000);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.removeEventListener("pointerdown", enter);
      window.removeEventListener("keydown", enter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // the DOM layer lets go: into the canvas (which is drawing the same frame), or a plain fade when there is no arrival
  useEffect(() => {
    if (revealed) loader.finish(skipIntro || reduced ? "fade" : "open");
  }, [revealed, skipIntro, reduced]);

  // the glass UI comes in only once the camera has landed and the desk has settled
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => setIntroDone(true), (skipIntro || reduced ? 0.4 : (isMobile ? ARRIVE_PHONE : ARRIVE) + 0.7) * 1000);
    return () => window.clearTimeout(t);
  }, [revealed, skipIntro, reduced, isMobile]);
  const idle = stage === "idle" && active && revealed && introDone && mode === "none";
  const live = active;
  const exit = useCallback(() => {
    // the hour is only ever set inside the camera: putting it down gives the sky back to the visitor's own clock
    if (modeRef.current === "camera") {
      setLiveSky(true);
      setTimeOverride(null);
      setHours(clockHours());
    }
    exitRef.current?.();
  }, []);

  // keyboard: Esc exits any mode, piano keys, book arrows, flight keys
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // (Ctrl on its own is the plane's brake; with another key it is the browser's)
      if (e.metaKey || e.altKey || (e.ctrlKey && !(mode === "plane" && k === "control"))) return;
      if (k === "escape") return exit();
      if (mode === "piano" && KEYMAP[k] !== undefined && !e.repeat) {
        strike(KEYMAP[k]);
        return;
      }
      if (mode === "book") {
        if (k === "arrowright") apiRef.current?.reader.current?.next();
        if (k === "arrowleft") apiRef.current?.reader.current?.prev();
      }
      if (mode === "plane" || mode === "camera" || (nav === "explore" && mode === "none")) {
        // an arrow pressed on a slider belongs to the slider
        if (k.startsWith("arrow") && (e.target as HTMLElement | null)?.tagName === "INPUT") return;
        // with the camera in the hand Space rises: it must not scroll the page, nor press whatever was clicked last
        // (a control reached with the keyboard keeps its own Space)
        if (mode === "camera" && k === " ") {
          if ((e.target as HTMLElement | null)?.closest?.("button, a, input")) return;
          e.preventDefault();
        }
        input.current.keys.add(k);
        if (k.startsWith("arrow")) e.preventDefault();
      }
    };
    const ku = (e: KeyboardEvent) => input.current.keys.delete(e.key.toLowerCase());
    // a key still held when the window loses focus never gets its keyup
    const drop = () => input.current.keys.clear();
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", drop);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", drop);
      drop();
    };
  }, [mode, exit, nav]);

  // The novel on a phone, a page at a time: the left page, then the right, then the leaf turns.
  const bookSide = useRef({ side: 0, k: 0.5 });
  const [bookPage, setBookPage] = useState(0);
  useEffect(() => {
    if (mode !== "book") return;
    bookSide.current.side = 0;
    bookSide.current.k = 0.5;
    setBookPage(0);
  }, [mode]);
  const bookStep = (dir: 1 | -1) => {
    const r = apiRef.current?.reader.current;
    if (!isMobile) return dir > 0 ? r?.next() : r?.prev();
    const B = bookSide.current;
    if (dir > 0) {
      if (B.side === 0) B.side = 1;
      else if (readerInfo.spread < readerInfo.spreads - 1) {
        r?.next();
        B.side = 0;
      }
    } else if (B.side === 1) B.side = 0;
    else if (readerInfo.spread > 0) {
      r?.prev();
      B.side = 1;
    }
    setBookPage(B.side);
  };

  const tap = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down.current.x = e.clientX;
    down.current.y = e.clientY;
    input.current.moved = false;
    input.current.dragging = true;
    input.current.last = performance.now();
    // one finger down and up again without moving, in the camera: focus there
    tap.current = mode === "camera" && pointers.current.size === 1 && e.button === 0;
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
      const dz = (v: number) => (Math.abs(v) < 0.09 ? 0 : THREE.MathUtils.clamp((v - Math.sign(v) * 0.09) * 1.45, -1, 1));
      // while the mouse is held and dragged it turns the eye instead, and the plane flies on level
      const looking = pointers.current.size > 0 && inp.moved;
      inp.sx = looking ? 0 : dz(inp.px);
      inp.sy = looking ? 0 : dz(-inp.py);
      inp.last = performance.now();
    }
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === "sketch") return; // the page takes the pointer
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (mode === "camera") {
        // two fingers carry the camera: half of each finger's travel is the pair's, the spread is a step in or out
        inp.tx += (e.clientX - prev.x) / 2;
        inp.ty += (e.clientY - prev.y) / 2;
        inp.pinch += d - down.current.pinch;
      } else inp.zoom += (down.current.pinch - d) * 2.2;
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
    // a release that began on a control (its press never reached the scene) is not a gesture on the scene
    const mine = pointers.current.delete(e.pointerId);
    if (mode === "camera" && mine && tap.current && !input.current.moved && e.type === "pointerup") apiRef.current?.focusAt(e.clientX, e.clientY);
    tap.current = false;
    if (mine && mode === "book" && Math.abs(e.clientX - down.current.x) > 50 && Math.abs(e.clientX - down.current.x) > Math.abs(e.clientY - down.current.y)) {
      bookStep(e.clientX < down.current.x ? 1 : -1);
    }
    if (pointers.current.size === 0) {
      input.current.dragging = false;
      setDragging(false);
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
      className={`${geist.className} absolute inset-0 touch-none select-none`}
      style={{ letterSpacing: TRACK.body, cursor: mode === "plane" ? "crosshair" : mode === "camera" ? (dragging ? "grabbing" : "crosshair") : mode !== "none" && mode !== "music" ? "default" : !idle ? "default" : dragging ? "grabbing" : "grab" }}
      onPointerDown={(e) => {
        // a click during the arrival skips straight to the desk
        if (revealed && !introDone) {
          apiRef.current?.skip();
          setIntroDone(true);
        }
        // sound may only begin on a gesture: this is the first one
        startAmbience();
        onDown(e);
      }}
      onPointerMove={onMove}
      onPointerUp={(e) => {
        // on a phone it is the finger lifting that the browser takes for a gesture
        startAmbience();
        onUp(e);
      }}
      onPointerCancel={onUp}
      onPointerLeave={() => {
        // a pointer that has left the window is not holding the plane's stick
        if (mode === "plane" && !isMobile) input.current.sx = input.current.sy = 0;
      }}
      onWheel={(e) => {
        if (mode === "camera") photoCtl.onWheel?.(e.ctrlKey ? e.deltaY * 2.5 : e.deltaY);
        // in flight the wheel (and a trackpad pinch, ctrl+wheel) draws the eye in or out: up to come closer
        if (mode === "plane") input.current.zoom += e.ctrlKey ? e.deltaY * 2.5 : e.deltaY;
        if (!orbiting) return;
        // scroll up (or pinch out, which arrives as ctrl+wheel) moves in
        input.current.zoom += e.ctrlKey ? e.deltaY * 2.5 : e.deltaY;
        input.current.last = performance.now();
      }}
    >
      <Canvas
        key={isMobile ? "m" : "d"}
        frameloop={live && !hidden ? "always" : "never"}
        dpr={[Math.min(1, q.dpr), Math.min(q.dpr, isMobile ? 1.5 : 2)]}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: RIG[isMobile ? "mobile" : "desktop"].fov, near: 0.01, far: 12000, position: [0, 1.2, 2.2] }}
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
          onProgress={(p) => loader.set(p)}
          onReady={() => setReady(true)}
          onHandoff={onHandoff}
          onReaderInfo={setReaderInfo}
          onSky={setSky}
          bookSide={bookSide}
          q={q}
        />
      </Canvas>

      {/* warm light leak toward a low sun, and a soft vignette; both gone before the hand-off */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen transition-opacity duration-700"
        style={{
          opacity: introDone && stage === "idle" && mode === "none" && sky.hdr === "sunset" ? 1 : 0,
          background: "radial-gradient(55% 60% at 0% 28%, rgb(255 190 125 / 0.28), rgb(255 170 110 / 0.06) 55%, transparent 75%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{ opacity: introDone && q.post === 0 && (stage === "idle" || mode !== "none") ? 1 : 0, background: "radial-gradient(120% 95% at 50% 45%, transparent 55%, rgb(10 10 14 / 0.3) 100%)" }}
      />

      {/* the hint speaks of the desk: it steps aside while walking the field, and on a narrow window it keeps to the right, clear of the controls */}
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-500" style={{ opacity: idle && nav === "orbit" ? 1 : 0 }}>
        <div className="absolute inset-x-0 bottom-8 flex justify-center px-4 sm:max-lg:justify-end">
          <Glass className="flex h-9 items-center gap-2 px-4 text-[13px] font-medium">
            <span>{introOff ? (isMobile ? "Tap the phone to power on" : "Click the display to power on") : isMobile ? "Tap the phone to start" : "Click the display to start"}</span>
            <span className="hidden text-white/65 md:inline">or try anything on the desk</span>
          </Glass>
        </div>
      </div>

      <AnimatePresence>
        {revealed && introDone && active && mode === "none" && (stage === "idle" || stage === "unfocus") && (
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
            mobile={isMobile}
            label={isMobile ? "Drag to look · pinch to zoom" : `${sky.label || "Live sky"} · drag to look around`}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mode === "piano" && <PianoUI key="piano" onExit={exit} />}
        {mode === "camera" && <CameraUI
            key="camera"
            mobile={isMobile}
            onExit={exit}
            onShoot={() => apiRef.current?.shoot() ?? null}
            onLift={(d) => {
              // (the two touch buttons hold the same keys down)
              const k = input.current.keys;
              k.delete(" ");
              k.delete("shift");
              if (d > 0) k.add(" ");
              else if (d < 0) k.add("shift");
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
          />}
        {mode === "music" && <MusicUI key="music" onExit={exit} />}
        {mode === "book" && (
          <BookUI
            key="book"
            info={readerInfo}
            onExit={exit}
            page={isMobile ? { n: Math.min(readerInfo.spreads * 2 - 2, Math.max(1, readerInfo.spread * 2 + bookPage)), of: readerInfo.spreads * 2 - 2 } : undefined}
            onPrev={() => bookStep(-1)}
            onNext={() => bookStep(1)}
            onApp={novelApp}
          />
        )}
        {mode === "sketch" && <SketchUI key="sketch" onExit={exit} onClear={() => apiRef.current?.sketch.current?.clear()} onSave={() => apiRef.current?.sketch.current?.save()} />}
        {mode === "plane" && (
          <FlightUI
            key="plane"
            onLand={exit}
            mobile={isMobile}
            flying={stage === "fly"}
            onStick={(x, y) => {
              input.current.jx = x;
              input.current.jy = y;
            }}
          />
        )}
      </AnimatePresence>

      {/* the place has a sound of its own; one small pill silences it */}
      <AnimatePresence>
        {revealed && introDone && active && stage !== "boot" && stage !== "approach" && stage !== "done" && (
          <Glass
            key="mute"
            className={`!absolute z-30 ${isMobile ? "" : "right-4 top-4"}`}
            style={isMobile ? { top: "max(12px, env(safe-area-inset-top))", right: "max(14px, env(safe-area-inset-right))" } : undefined}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={GLASS_SPRING}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={quiet ? "Turn ambient sound on" : "Mute ambient sound"}
              aria-pressed={quiet}
              className={`lg-btn grid place-items-center text-white ${isMobile ? "h-11 w-11" : "h-9 w-9"}`}
              onClick={(e) => {
                e.stopPropagation();
                startAmbience();
                setAmbienceMuted(!quiet);
              }}
            >
              {quiet ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
            </button>
          </Glass>
        )}
      </AnimatePresence>
      <GlassStyles />
    </div>
  );
}
