import { audioGraph, channel, track } from "@/lib/audio";
import { chime, shutdownChord } from "@/lib/piano";
import { useOS } from "@/store";

// System sounds from recorded CC0 files (Kenney UI Audio and others, see
// CREDITS.md), decoded once through the shared AudioContext. Same API as before:
//
//   import { play } from "@/lib/sfx";
//   play("click");  play("error", { volume: 0.6 });

export type Sfx =
  | "boot"
  | "click"
  | "pop"
  | "open"
  | "close"
  | "minimize"
  | "zoom"
  | "error"
  | "notify"
  | "lock"
  | "unlock"
  | "type"
  | "page"
  | "whoosh"
  | "plane"
  | "trash"
  | "shutdown"
  | "shutter"
  | "thud";

// Each name maps to one or more candidate files; the first that decodes wins,
// and names with several variants pick one at random each time.
// Only a few moments have sound: the boot chime, Shut Down, page turns, the
// camera shutter and the paper plane. Every other name is a silent no-op so
// OS calls stay harmless.
const SILENT = new Set<Sfx>(["click", "pop", "open", "close", "minimize", "zoom", "error", "notify", "lock", "unlock", "type", "trash"]);
const FILES: Record<Sfx, { files: string[]; vol?: number; random?: boolean; slice?: number; trim?: boolean; pitch?: number; len?: number }> = {
  boot: { files: [] }, // sampled piano chord (lib/piano.ts)
  shutdown: { files: [] }, // sampled piano, falling
  click: { files: [] },
  pop: { files: [] },
  open: { files: [] },
  close: { files: [] },
  minimize: { files: [] },
  zoom: { files: [] },
  error: { files: [] },
  notify: { files: [] },
  lock: { files: [] },
  unlock: { files: [] },
  type: { files: [] },
  trash: { files: [] },
  page: { files: ["/assets/sfx/pages.ogg"], vol: 0.6, slice: 0.7 },
  whoosh: { files: [] }, // a soft filtered-air sweep, generated below
  plane: { files: [] },
  // (the recording holds two releases, the second 2.2 s after the first: only the first is ever played)
  shutter: { files: ["/assets/sfx/shutter.ogg"], vol: 0.55, trim: true, len: 0.95 },
  thud: { files: [] }, // something heavy set down on the desk, generated below
};

const KEY = "aos.sound";
let enabled = true;
try {
  if (typeof window !== "undefined") enabled = window.localStorage.getItem(KEY) !== "0";
} catch {
  /* storage blocked: default on */
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
  try {
    useOS.getState().setSound(on);
  } catch {
    /* store not ready */
  }
}

let out: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

// out -> gentle low-pass -> the sfx channel, plus a faint short room (two damped
// feedback delays) so dry clicks sound rounded instead of harsh.
function graph() {
  const { ctx } = audioGraph();
  if (!out) {
    out = ctx.createGain();
    out.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    lp.Q.value = 0.5;
    out.connect(lp).connect(channel("sfx"));
    const wet = ctx.createGain();
    wet.gain.value = 0.07;
    [0.023, 0.037].forEach((t) => {
      const d = ctx.createDelay(0.2);
      d.delayTime.value = t;
      const fb = ctx.createGain();
      fb.gain.value = 0.45;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 3200;
      lp.connect(d);
      d.connect(damp).connect(fb).connect(d);
      damp.connect(wet);
    });
    wet.connect(channel("sfx"));
  }
  return { ctx, out };
}

function load(url: string) {
  let p = buffers.get(url);
  if (!p) {
    const { ctx } = graph();
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

async function bufferFor(name: Sfx): Promise<AudioBuffer | null> {
  const spec = FILES[name];
  if (!spec.files.length) return null;
  if (spec.random) return load(spec.files[Math.floor(Math.random() * spec.files.length)]);
  for (const f of spec.files) {
    const b = await load(f);
    if (b) return b;
  }
  return null;
}

// Decode the common sounds early (after the first gesture) so they play instantly.
export function preloadSfx(names: Sfx[] = ["page", "shutter"]) {
  if (typeof window === "undefined") return;
  names.forEach((n) => void bufferFor(n));
}

let unlocked = false;
if (typeof window !== "undefined") {
  const unlock = () => {
    if (unlocked) return;
    try {
      const { ctx } = graph();
      void ctx.resume().then(() => {
        unlocked = ctx.state === "running";
        if (unlocked) preloadSfx();
      });
    } catch {
      /* no audio */
    }
  };
  ["pointerdown", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
}

// seconds of near-silence at the start of a buffer
const lead = new WeakMap<AudioBuffer, number>();
function leadingSilence(b: AudioBuffer) {
  let v = lead.get(b);
  if (v === undefined) {
    const d = b.getChannelData(0);
    let i = 0;
    while (i < d.length && Math.abs(d[i]) < 0.02) i++;
    v = Math.max(0, i / b.sampleRate - 0.005);
    lead.set(b, v);
  }
  return v;
}

// Moving air: band-passed noise swept up then down. Subtle on purpose.
let noise: AudioBuffer | null = null;
function air(ctx: AudioContext, dest: AudioNode, dur: number, vol: number) {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = last;
    }
  }
  const t = ctx.currentTime + 0.005;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(260, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.45);
  bp.frequency.exponentialRampToValueAtTime(500, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bp).connect(g).connect(dest);
  s.start(t);
  s.stop(t + dur + 0.05);
  track("sfx", s, "air");
}

// Something with weight set down on a solid oak top, heard from a pace away. Three things, all soft:
//   the body: a sine falling from about 78 Hz to 40 Hz, with a rounded onset (no click), the desk's own boom;
//   the wood: a short hollow "tok" a little over an octave above it (150 to 190 Hz, falling a touch), the part a
//     laptop's small speakers can actually give, gone in a tenth of a second;
//   the touch: a dull breath of low-passed noise for the first few hundredths, the felt of the thing meeting the top.
// `w` 0..1 is how heavy: heavier is lower, longer and a little louder. Kept quiet: it is felt more than heard.
// (Synthesised until there are recordings: see the home scene's notes for the ones to record.)
function thud(ctx: BaseAudioContext, dest: AudioNode, w: number, at?: number) {
  const t = at ?? ctx.currentTime + 0.003;
  const k = Math.max(0.15, Math.min(1, w));
  const v = 0.15 * (0.45 + 0.55 * k);
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(84 - 10 * k, t);
  body.frequency.exponentialRampToValueAtTime(43 - 5 * k, t + 0.2 + 0.1 * k);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(v, t + 0.014);
  bg.gain.setTargetAtTime(0.0001, t + 0.03, 0.05 + 0.04 * k);
  body.connect(bg).connect(dest);
  body.start(t);
  body.stop(t + 0.9);
  const wood = ctx.createOscillator();
  wood.type = "sine";
  wood.frequency.setValueAtTime(196 - 40 * k, t);
  wood.frequency.exponentialRampToValueAtTime(150 - 30 * k, t + 0.09);
  const wg = ctx.createGain();
  wg.gain.setValueAtTime(0.0001, t);
  wg.gain.exponentialRampToValueAtTime(v * 1.05, t + 0.007);
  wg.gain.setTargetAtTime(0.0001, t + 0.014, 0.04 + 0.014 * k);
  wood.connect(wg).connect(dest);
  wood.start(t);
  wood.stop(t + 0.5);
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = last;
    }
  }
  const touch = ctx.createBufferSource();
  touch.buffer = noise;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(620 - 220 * k, t);
  lp.frequency.exponentialRampToValueAtTime(150, t + 0.07);
  const kg = ctx.createGain();
  kg.gain.setValueAtTime(0.0001, t);
  kg.gain.exponentialRampToValueAtTime(v * 1.1, t + 0.005);
  kg.gain.setTargetAtTime(0.0001, t + 0.008, 0.022 + 0.012 * k);
  touch.connect(lp).connect(kg).connect(dest);
  touch.start(t, Math.random() * 1.5);
  touch.stop(t + 0.3);
  // (an offline render, for measuring, has nothing to track)
  if (typeof AudioContext !== "undefined" && ctx instanceof AudioContext) {
    track("sfx", body, "thud");
    track("sfx", wood, "thud");
    track("sfx", touch, "thud");
  }
}
// dev: the thud rendered offline, for measuring (no sound is played)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  Object.assign(window, {
    __thud: async (w: number) => {
      const off = new OfflineAudioContext(1, 48000, 48000);
      const keep = noise;
      noise = null;
      thud(off, off.destination, w, 0.01);
      const buf = await off.startRendering();
      noise = keep;
      return buf.getChannelData(0);
    },
  });

const lastAt = new Map<Sfx, number>();

export function play(name: Sfx, opts?: { volume?: number }) {
  if (!enabled || typeof window === "undefined" || SILENT.has(name)) return;
  try {
    const { ctx, out } = graph();
    if (ctx.state !== "running") {
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
      if (!(ua ? ua.isActive : unlocked)) return;
      void ctx.resume();
    }
    const spec = FILES[name];
    // no stacking: the same sound within 60 ms plays once
    const nowMs = performance.now();
    if (nowMs - (lastAt.get(name) ?? -1e9) < 60) return;
    lastAt.set(name, nowMs);
    if (name === "boot") return chime();
    if (name === "thud") return thud(ctx, out, opts?.volume ?? 0.5);
    if (name === "shutdown") return shutdownChord();
    if (name === "whoosh" || name === "plane") return air(ctx, out, name === "plane" ? 1.1 : 0.55, (opts?.volume ?? 1) * (name === "plane" ? 0.5 : 0.35));
    const asked = performance.now();
    void bufferFor(name).then((buf) => {
      // a sound that took too long to load is late: drop it
      if (!buf || performance.now() - asked > 600) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // slight random pitch so repeats don't sound mechanical
      src.playbackRate.value = (spec.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * 0.03);
      const g = ctx.createGain();
      const v = (spec.vol ?? 0.7) * (opts?.volume ?? 1);
      const t = ctx.currentTime + 0.003;
      if (spec.slice) {
        // a short, faded slice of a longer recording (paper rustle)
        // one of four fixed turns spread through the recording
        const start = (0.12 + 0.2 * Math.floor(Math.random() * 4)) * Math.max(0, buf.duration - spec.slice);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.04);
        g.gain.setValueAtTime(v, t + spec.slice - 0.15);
        g.gain.linearRampToValueAtTime(0, t + spec.slice);
        src.connect(g).connect(out);
        src.start(t, start, spec.slice);
        track("sfx", src, name);
      } else {
        // short fade in and out on every file: no clicks at the edges
        const off = spec.trim ? leadingSilence(buf) : 0;
        const len = Math.min(buf.duration - off, spec.len ?? 1e9) / src.playbackRate.value;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + 0.006);
        g.gain.setValueAtTime(v, t + Math.max(0.01, len - 0.03));
        g.gain.linearRampToValueAtTime(0, t + len);
        src.connect(g).connect(out);
        src.start(t, off);
        if (spec.len) src.stop(t + len + 0.01);
        track("sfx", src, name);
      }
    });
  } catch {
    /* audio unavailable */
  }
}
