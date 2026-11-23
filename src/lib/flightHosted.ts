import { useSyncExternalStore } from "react";
import { channel, musicOwner, resumeAudio, stopOwner, voice, voicePlay, voicePrime, voiceStop, type Voice } from "@/lib/audio";

// The flight's hosted music (the fallback when a Čiurlionis stream cannot
// play): M. K. Čiurlionis's own piano work "The Sea"
// (Jūra, VL 317), played by Jean Dubé (CC BY 4.0, see CREDITS.md). One
// recording, three movements, dealt out to the worlds by mood. The music
// director (lib/musicDirector.ts) decides when this plays; nothing else calls it.
//
//
//   Moderato            the forest avenue, the Sun, the Stars
//   Andante             Rex, Fairy Tale, Paradise, the Funeral Symphony, Karalių pasaka
//   Allegro impetuoso   the mountain gate and the sea
//
// Where the movements begin and end was read from the recording itself (its
// loudness in half-second windows, offline): the piano enters at 9.3 s, the
// Moderato dies away by 147.5 s, 8 s of silence, the Andante runs from 155.5 s
// to 316.5 s, 5.5 s of silence, the Allegro from 322 s to the last chord's
// decay at 391 s.
//
//   hostedFlightTo(key) go to the movement of that world. A world that shares
//                       the movement already playing changes nothing: the music
//                       simply carries on. Another movement comes in under a long
//                       equal-power cross-fade, and from where it was left if it
//                       was heard earlier in the same flight. A movement that
//                       reaches its end begins again under a cross-fade, at its
//                       own cadence, so it never stops and never jumps.
//   hostedFlightStop()  fade out, pause and let go of the file.
//
// (His own Afterlight is no longer part of this: his music plays only when it is chosen.)
//
// The two decks are voices of the audio manager (lib/audio.ts), owner
// "flight" on the "flight" channel: taking off fades the headphones out,
// and the sky hears the flight through the shared analyser.

const SEA = "/content/music/ciurlionis-jura-dube.mp3";
export const FLIGHT_CREDIT = "M. K. Čiurlionis, The Sea · Jean Dubé, piano · CC BY 4.0";

type PartId = "moderato" | "andante" | "allegro";
type Part = { file: string; from: number; to: number; name: string };
export const FLIGHT_PARTS: Record<PartId, Part> = {
  moderato: { file: SEA, from: 8.8, to: 147.2, name: "The Sea, Moderato" },
  andante: { file: SEA, from: 155.2, to: 316.4, name: "The Sea, Andante" },
  allegro: { file: SEA, from: 321.7, to: 390.4, name: "The Sea, Allegro impetuoso" },
};

export type FlightTrack = { part: PartId; gain?: number };
export const FLIGHT_TRACKS: Record<string, FlightTrack> = {
  road: { part: "moderato" },
  forest: { part: "moderato" },
  sun: { part: "moderato" },
  stars: { part: "moderato", gain: 0.9 },
  rex: { part: "andante" },
  fairy: { part: "andante" },
  paradise: { part: "andante", gain: 0.92 },
  gate: { part: "allegro", gain: 0.85 }, // the Allegro is the loudest of the three: held back a little
  sea: { part: "allegro", gain: 0.8 },
  seafinale: { part: "allegro", gain: 0.9 }, // the storm of the Finale: the Allegro at its fullest
  funeral: { part: "andante", gain: 0.62 }, // the procession: the Andante from far off
  kings: { part: "andante", gain: 0.8 },
  home: { part: "andante", gain: 0.8 }, // the way home out of the kings' light: the Andante carries on
};

const FADE = 6; // seconds between movements: one leaves under the cloud while the next arrives with the new sky
const LOOP_X = 4.5; // seconds a movement's end overlaps its own beginning

// Kept on globalThis with the decks themselves, so a hot reload carries on
// instead of starting a second copy.
type Flight = { live: 0 | 1; part: (PartId | null)[]; key: string | null; pos: Partial<Record<PartId, number>>; pending: number; primed: boolean; watch: number; credit: number };
const S: Flight = ((globalThis as typeof globalThis & { __aosFlight2?: Flight }).__aosFlight2 ??= {
  live: 0,
  part: [null, null],
  key: null,
  pos: {},
  pending: 0,
  primed: false,
  watch: 0,
  credit: 0,
});

// ---- the credit: shown by the flight's UI for a while each time the recording begins ----
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const useFlightCredit = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => S.credit,
    () => 0,
  );

export const hostedFlightActive = () => !!(S.part[0] || S.part[1] || S.pending);
function decks(): [Voice, Voice] | null {
  const o = { channel: "flight", owner: "flight", scene: true, loop: false } as const;
  const a = voice("flight-a", o);
  const b = voice("flight-b", o);
  return a && b ? [a, b] : null;
}

function seek(v: Voice, idx: number, id: PartId, at: number) {
  const go = () => {
    if (S.part[idx] !== id) return;
    try {
      v.el.currentTime = at;
    } catch {
      /* not seekable yet: it starts from the top */
    }
  };
  if (v.el.readyState >= 1) go();
  else v.el.addEventListener("loadedmetadata", go, { once: true });
}

// Put a movement on a deck and bring it up.
function start(v: Voice, idx: number, id: PartId, level: number, fade: number, fromTop = false) {
  const part = FLIGHT_PARTS[id];
  S.part[idx] = id;
  v.el.loop = part.to === Infinity;
  if (v.el.getAttribute("src") !== part.file) v.el.src = part.file;
  let at = fromTop ? part.from : (S.pos[id] ?? part.from);
  // left within a breath of its end: begin it again instead
  if (at < part.from || at > part.to - 12) at = part.from;
  if (at > 0.05 || v.el.currentTime > 0.05) seek(v, idx, id, at);
  voicePlay(v, { fade, level });
  if (part.file === SEA && !S.credit) {
    S.credit = performance.now();
    emit();
  }
}

// A movement that has come to its end begins again on the other deck, the two overlapping.
function watch() {
  const d = decks();
  if (!d || S.pending) return;
  const id = S.part[S.live];
  if (!id) return;
  const part = FLIGHT_PARTS[id];
  const cur = d[S.live];
  if (!cur.want || part.to === Infinity) return;
  const t = cur.el.currentTime;
  if (!(cur.el.ended || t >= part.to - LOOP_X)) return;
  const next = (1 - S.live) as 0 | 1;
  const other = d[next];
  // the other deck is still letting an earlier movement go: wait for it
  if (!other.el.paused && !other.el.src.startsWith("blob:")) return;
  const level = (FLIGHT_TRACKS[S.key ?? ""] ?? FLIGHT_TRACKS.road).gain ?? 1;
  voiceStop(cur, LOOP_X);
  S.part[S.live] = null;
  S.live = next;
  start(other, next, id, level, LOOP_X, true);
}
function watching(on: boolean) {
  if (typeof window === "undefined") return;
  window.clearInterval(S.watch);
  S.watch = on ? window.setInterval(watch, 300) : 0;
}

// Called from a tap that will lead to a flight a moment later (the phone's Fly shortcut): the output is woken and
// both decks play their moment of silence inside the tap, so the music may start on its own when the plane leaves.
export function hostedFlightPrime() {
  if (typeof window === "undefined") return;
  resumeAudio();
  const d = decks();
  if (!d) return;
  S.primed = true;
  d.forEach((v) => voicePrime(v));
}

// Go to the music of a world (its `music` key in worlds/voyage.ts).
export function hostedFlightTo(key: string) {
  if (typeof window === "undefined") return;
  const track = FLIGHT_TRACKS[key] ?? FLIGHT_TRACKS.road;
  const id = track.part;
  const level = track.gain ?? 1;
  const d = decks();
  if (!d) return;
  const cur = d[S.live];
  const other = d[1 - S.live];
  const next = (1 - S.live) as 0 | 1;
  S.key = key;
  // (take-off is a tap: the output is woken inside it, before anything is asked to play)
  resumeAudio();
  if (!S.primed) {
    // the deck that waits is given its moment of silence inside the tap: a phone refuses a first play() from a timer
    S.primed = true;
    voicePrime(cur);
  }
  if (!S.watch) watching(true);
  if (S.part[S.live] === id && (cur.want || S.pending)) {
    // the same movement carries on into the next world: no restart, no dip, only its level leans
    if (cur.want) voicePlay(cur, { fade: FADE, level });
    return;
  }
  window.clearTimeout(S.pending);
  S.pending = 0;
  if (cur.want) {
    const p = S.part[S.live];
    if (p) S.pos[p] = cur.el.currentTime;
    voiceStop(cur, FADE);
  }
  S.live = next;
  if (S.part[next] === id && !other.el.paused && !other.el.src.startsWith("blob:")) {
    // we only just left this movement and it is still fading: turn it around
    voicePlay(other, { fade: FADE, level });
    return;
  }
  S.part[next] = id;
  const later = (ms: number) => {
    S.pending = window.setTimeout(() => {
      S.pending = 0;
      if (S.part[next] === id) start(other, next, id, level, FADE);
    }, ms);
  };
  const owner = musicOwner();
  if (!other.el.paused && !other.el.src.startsWith("blob:")) {
    // the deck is still fading something else out: let that go first
    voiceStop(other, 0.3);
    later(420);
  } else if (owner && owner !== "flight") {
    // the headphones are playing: they leave first, then the flight comes in
    // (two recordings are never heard on top of each other)
    voicePrime(other);
    stopOwner(owner, 0.7);
    later(600);
  } else start(other, next, id, level, FADE);
}

// Fade everything out, pause, release (landing).
export function hostedFlightStop(fade = 5) {
  if (typeof window === "undefined") return;
  // nothing was started: nothing to stop (and no reason to make the decks)
  if (!S.part[0] && !S.part[1] && !S.pending) return;
  window.clearTimeout(S.pending);
  watching(false);
  S.pending = 0;
  S.part = [null, null];
  S.key = null;
  S.pos = {};
  if (S.credit) {
    S.credit = 0;
    emit();
  }
  stopOwner("flight", fade, true);
}

export function hostedFlightVolume(v: number) {
  if (typeof window === "undefined") return;
  const g = channel("flight");
  g.gain.setTargetAtTime(v, g.context.currentTime, 0.2);
}

// Development: window.__flight = { to, stop, state, tracks, parts, report } for driving
// the cross-fades from the console (silently, under ?mute=1).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const report = () => {
    const d = decks();
    return {
      key: S.key,
      live: S.live,
      pending: !!S.pending,
      pos: { ...S.pos },
      decks: d?.map((v, i) => ({ part: S.part[i], t: +v.el.currentTime.toFixed(1), paused: v.el.paused, want: v.want, target: v.level, gain: v.gain ? +v.gain.gain.value.toFixed(3) : null, src: (v.el.getAttribute("src") ?? "").split("/").pop() })),
    };
  };
  Object.assign(window, { __flight: { to: hostedFlightTo, stop: hostedFlightStop, state: S, tracks: FLIGHT_TRACKS, parts: FLIGHT_PARTS, report, watch } });
  // a reloaded module takes the watch over from the old one
  if (S.watch) watching(true);
}
