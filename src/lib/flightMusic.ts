import { music, resumeAudio, tapMediaElement } from "@/lib/audio";

// Music for the flight: one track per stretch of the road, cross-faded as the
// plane passes from one painting's world into the next.
//
// No recordings of Čiurlionis's own music are in the project yet, so every
// stretch currently points at the same placeholder (his Nocturne). To give a
// station its own piece, drop the file in /public/content/music/ and change
// its entry here: nothing else needs to know.

const PLACEHOLDER = "/content/music/nocturne-for-absent-things.mp3";

export type FlightTrack = { file: string; title: string; start?: number; gain?: number };
export const FLIGHT_TRACKS: Record<string, FlightTrack> = {
  road: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  forest: { file: PLACEHOLDER, title: "Nocturne for Absent Things" }, // e.g. "Miške" (In the Forest), symphonic poem
  sun: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  stars: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  rex: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  fairy: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  paradise: { file: PLACEHOLDER, title: "Nocturne for Absent Things" },
  sea: { file: PLACEHOLDER, title: "Nocturne for Absent Things" }, // e.g. "Jūra" (The Sea), symphonic poem
};

const FADE = 2.6; // seconds
type Deck = { el: HTMLAudioElement; gain: GainNode | null; key: string | null; vol: number; target: number };
let decks: Deck[] | null = null;
let live = 0;
let raf = 0;
let last = 0;
let master = 0.85;

function makeDeck(): Deck {
  const el = new Audio();
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.loop = true;
  let gain: GainNode | null = null;
  try {
    // through a gain of its own into the shared analyser, so the sky can hear it
    tapMediaElement(el, (ctx) => {
      gain = ctx.createGain();
      gain.gain.value = 0;
      return gain;
    });
  } catch {
    gain = null;
  }
  return { el, gain, key: null, vol: 0, target: 0 };
}

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let any = false;
  for (const d of decks!) {
    const step = dt / FADE;
    d.vol = d.target > d.vol ? Math.min(d.target, d.vol + step) : Math.max(d.target, d.vol - step);
    const v = d.vol * d.vol * (3 - 2 * d.vol) * master;
    if (d.gain) d.gain.gain.value = v;
    else d.el.volume = v;
    if (d.vol <= 0 && d.target <= 0 && !d.el.paused) d.el.pause();
    if (d.vol > 0 || d.target > 0) any = true;
  }
  music.playing = any && decks!.some((d) => !d.el.paused);
  if (!any) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
}

// Cross-fade to the track for a stretch of the road (a station id, "road" or "sea").
export function flightMusicTo(key: string) {
  const track = FLIGHT_TRACKS[key] ?? FLIGHT_TRACKS.road;
  if (typeof window === "undefined") return;
  resumeAudio();
  decks ??= [makeDeck(), makeDeck()];
  const cur = decks[live];
  if (cur.key !== null && FLIGHT_TRACKS[cur.key]?.file === track.file && cur.target > 0) {
    // the same recording carries on under a new name: no restart, no dip
    cur.key = key;
    return;
  }
  const next = decks[1 - live];
  cur.target = 0;
  next.key = key;
  next.target = track.gain ?? 1;
  if (!next.el.src.endsWith(track.file)) next.el.src = track.file;
  if (track.start) next.el.currentTime = track.start;
  void next.el.play().catch(() => {
    next.target = 0;
  });
  live = 1 - live;
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

// Fade everything out (landing).
export function flightMusicStop() {
  if (!decks) return;
  decks.forEach((d) => (d.target = 0));
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

export function flightMusicVolume(v: number) {
  master = v;
}
