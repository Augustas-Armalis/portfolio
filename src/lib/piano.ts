import { audioGraph, channel, resumeAudio, track } from "@/lib/audio";

// Sampled grand piano (Salamander Grand, CC-BY, see CREDITS.md): one sample
// every minor third (A, C, D#, F#), pitch-shifted to the nearest note.
// Shared by the 3D piano, the OS Piano app (via audio.ts note()) and the boot chime.

const NAMES = ["C", "Ds", "Fs", "A"];
const OFFS = [0, 3, 6, 9];
const sampleMidis: number[] = [];
for (let oct = 0; oct <= 7; oct++) {
  OFFS.forEach((o) => {
    const m = 12 * (oct + 1) + o;
    if (m >= 21 && m <= 96) sampleMidis.push(m);
  });
}
const fileFor = (m: number) => `/assets/piano/${NAMES[OFFS.indexOf(m % 12)]}${Math.floor(m / 12) - 1}.mp3`;

const cache = new Map<number, Promise<AudioBuffer | null>>();
let out: GainNode | null = null;

function graph() {
  const g = audioGraph();
  if (!out) {
    out = g.ctx.createGain();
    out.gain.value = 0.7;
    // the piano channel passes the analyser, so the music visuals react to it
    out.connect(channel("piano"));
  }
  return { ctx: g.ctx, out };
}

function load(m: number) {
  let p = cache.get(m);
  if (!p) {
    const { ctx } = graph();
    p = fetch(fileFor(m))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null);
    cache.set(m, p);
  }
  return p;
}

function nearest(midi: number) {
  let best = sampleMidis[0];
  for (const m of sampleMidis) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  return best;
}

export function preloadPiano(from = 48, to = 84) {
  if (typeof window === "undefined") return;
  sampleMidis.filter((m) => m >= from - 2 && m <= to + 2).forEach((m) => void load(m));
}

export function pianoReady(midi: number) {
  return cache.has(nearest(midi));
}

// Returns false if the sample isn't decoded yet (it starts loading), so a
// caller can fall back or retry.
// `to` sends the note to a bus of the caller's instead of the shared output
// (the ambience routes its bed through its own reverb and fades); `gain` is an
// absolute level that replaces the velocity curve; `attack` softens the hammer
// and `release` is the length of the tail after `dur`.
export function playPiano(
  midi: number,
  {
    when = 0,
    vel = 0.8,
    dur = 3,
    to,
    gain,
    attack = 0,
    release = 0.8,
  }: { when?: number; vel?: number; dur?: number; to?: AudioNode; gain?: number; attack?: number; release?: number } = {},
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const { ctx, out } = graph();
    resumeAudio();
    const m = nearest(midi);
    const p = load(m);
    void p.then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.pow(2, (midi - m) / 12);
      const g = ctx.createGain();
      const t = Math.max(ctx.currentTime, ctx.currentTime + when);
      const v = gain ?? 0.25 + vel * 0.75;
      if (attack > 0) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + attack);
      } else {
        g.gain.setValueAtTime(v, t);
      }
      g.gain.setValueAtTime(v, t + Math.max(dur, attack));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
      src.connect(g).connect(to ?? out);
      src.start(t);
      src.stop(t + dur + release + 0.1);
      track(to ? "ambience" : "piano", src, `note ${midi}`);
    });
    return true;
  } catch {
    return false;
  }
}

// A soft, spread F major chord: the boot chime.
export function chime() {
  [41, 53, 57, 60, 65, 69].forEach((m, i) => playPiano(m, { when: i * 0.035, vel: 0.35 - i * 0.02, dur: 3.2 }));
}

// Shut Down: the same voicing, falling and fading.
export function shutdownChord() {
  [69, 65, 60, 57, 53].forEach((m, i) => playPiano(m, { when: i * 0.09, vel: 0.28 - i * 0.02, dur: 1.6 }));
}
