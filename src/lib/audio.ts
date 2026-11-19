import { useOS } from "@/store";
import { playPiano } from "@/lib/piano";

// Tiny Web Audio piano. Wireframe quality: soft triangle + sine, no samples.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

// master -> lowpass -> analyser -> speakers. The analyser is a pass-through tap.
function ensureGraph() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    master.connect(lp).connect(analyser).connect(ctx.destination);
  }
  return { ctx, master: master!, analyser: analyser! };
}

// Shared graph for other modules (sfx.ts). Does not resume the context.
export function audioGraph() {
  return ensureGraph();
}

function getAudio() {
  const g = ensureGraph();
  if (g.ctx.state === "suspended") void g.ctx.resume();
  return g;
}

// Frequency data of everything the OS plays (piano, records). Safe to call
// before any sound: the context stays suspended until the first note.
export function getAnalyser(): AnalyserNode | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  return ensureGraph().analyser;
}

// Route an <audio>/<video> element through the same output so it shows up in
// getAnalyser(). Call once per element.
export function tapMediaElement(el: HTMLMediaElement) {
  const { ctx, analyser } = ensureGraph();
  const src = ctx.createMediaElementSource(el);
  src.connect(analyser);
  return src;
}

export function note(midi: number, when = 0, dur = 1.8, vel = 0.8) {
  if (!useOS.getState().sound) return;
  // real sampled grand (lib/piano.ts); the synth below is only a fallback
  getAudio();
  if (playPiano(midi, { when, vel, dur: Math.max(dur, 1.2) })) return;
  const { ctx, master } = getAudio();
  const t = ctx.currentTime + when;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const partials: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.22],
    ["sine", 3, 0.06],
  ];
  for (const [type, mult, amp] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

// A slow placeholder progression for the Records app (D♭ major, 60 bpm).
const CHORDS = [
  [49, 56, 61, 65, 68],
  [46, 53, 58, 61, 65],
  [42, 54, 58, 61, 66],
  [44, 56, 60, 63, 68],
];

export function playSketch(): { stop: () => void; length: number } {
  if (!useOS.getState().sound) return { stop: () => {}, length: 0 };
  const timers: number[] = [];
  const bar = 2;
  CHORDS.concat(CHORDS).forEach((chord, i) => {
    chord.forEach((m, j) => {
      const delay = i * bar + (j === 0 ? 0 : 0.35 * j);
      timers.push(window.setTimeout(() => note(m, 0, j === 0 ? 3.2 : 2.4, j === 0 ? 0.7 : 0.45), delay * 1000));
    });
  });
  return { stop: () => timers.forEach(clearTimeout), length: CHORDS.length * 2 * bar };
}
