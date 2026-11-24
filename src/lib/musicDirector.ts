import { useSyncExternalStore } from "react";
import { audioGraph, audioHushed, channel, externalMusic, fadeParam, onMusicClaim, onMuteChange, onOwnerStop, resumeAudio, sceneMuted, setDeskMusic, voice, voicePlay, voicePrime, voiceRoute, voiceStop, type Voice } from "@/lib/audio";
import { MUSIC_CREDIT } from "@/lib/musicCredits";
import { fieldMusicGain, getSoundSettings, masterGain, setSoundSettings, subscribeSoundSettings } from "@/lib/soundSettings";

// The music of the 3D world. Three drop-in files, each where it belongs, and nothing to choose:
//
//   public/content/music/field.mp3    at home: the desk, and the field round it in the air too
//   public/content/music/forest.mp3   the hidden forest and the cave (home world), and the voyage from there
//                                     through Paradise
//   public/content/music/sea.mp3      The Offering (gate) to the end: the Sea Finale, the sea, the funeral, the kings
//
// Replace a file to change what plays there (about 128 kbps MP3; any length: each loops on its own, crossing its
// end into its beginning), and update its credit in lib/musicCredits.ts and CREDITS.md. Until Augustas gives his own:
// field.mp3 is twelve seconds of silence, forest.mp3 is Čiurlionis's Prelude in D minor, VL 268, and sea.mp3 his
// The Sea, VL 317, both played by Jean Dubé (CC BY 4.0, credited in Settings → Sound).
//
// They are played through the audio graph: no player, no frame, nothing on screen but the sound control. A piece
// is never restarted while the plane stays in its range: going from world to world inside it (in any order, by
// the gates or by the Worlds list) changes nothing. Crossing between ranges is a slow cross-fade between the two
// decks, and each piece is taken up where it was left (kept for the visit). In the home world the field's music
// carries on through the take-off; flying into the forest or near the cave (Room tells us how far in,
// musicForest), it hands over to the forest's, and back again on the way out. Landing hands back to the field.
// Files are loaded only when they are first asked for: the field's at the desk, the flight's on take-off, and the
// piece that comes next (forest while the field plays, sea while the forest does) is buffered on a deck of its own
// during the range before it, so a change of range never waits for a file. Nothing starts before the visitor's first
// touch (it waits, and the sky and the ambience are not told there is music). A file that will not load is silence
// for the visit.
//
// Three decks pour into one bus: a deck carries only its piece's own level and its fades (equal power, seven seconds
// a hand-over), and everything else (the visitor's levels, the kings' wood, a crossing's duck) leans the bus, so a
// level never cuts into a fade in progress. A crossing between worlds is silent: musicCrossing ducks the bus into the
// cloud (0.6 s) and brings it back after the swap (1.2 s), and a piece that is due to change waits until it is over.
//
// His own songs are never played here by themselves: they are in the OS's Records and on the desk's headphones,
// by his choice.
//
// One thing plays at a time, across the whole site. In flight the music is the owner "flight" of the audio
// manager (the headphones and the OS's player fade out for it, the ambience ducks under it, and it stops when
// they start or when the room is left); at the desk it is background that nobody owns, and it leaves the moment
// anything else plays.
//
// Its level is the shared "music" level of lib/soundSettings.ts (the scene's settings and the OS's Settings show
// the same one), under the master volume; the mute is the music's own, and the scene's sound button and the
// system's Sound switch silence it with everything else.
//
// Development: window.__music.report() (states, levels, what was asked for and why), .forest(k) to rehearse the
// forest's edge, .mute(on), .volume(v).

export type PieceId = "field" | "forest" | "sea";
export type Place = "desk" | "flight";
export type Piece = {
  id: PieceId;
  file: string;
  credit: string | null; // as its licence asks it to be named (lib/musicCredits.ts; null: nothing to credit)
  level: number; // the voice's level at the slider's middle mark
  x: number; // seconds its end and its beginning overlap as it loops
};
export const PIECES: Record<PieceId, Piece> = {
  field: { id: "field", file: "/content/music/field.mp3", credit: MUSIC_CREDIT.field, level: 0.45, x: 4 },
  forest: { id: "forest", file: "/content/music/forest.mp3", credit: MUSIC_CREDIT.forest, level: 0.65, x: 4 },
  sea: { id: "sea", file: "/content/music/sea.mp3", credit: MUSIC_CREDIT.sea, level: 0.65, x: 4.5 },
};

// The voyage in two halves (worlds/voyage.ts `music` keys). Everything else in the air is the forest's, except the
// home world ("road", at take-off and whenever the plane is back in it), which is the field's unless the plane is
// in the forest, and "home", the way back out of the kings' light, which is the landing.
const SEA_RANGE = new Set(["gate", "seafinale", "sea", "funeral", "kings"]);
// seconds: every hand-over is slow (field to forest and back, the two halves of the voyage, the landing)
const FADE = { change: 7, desk: 4, out: 2.5, press: 1.6 };
// A crossing between worlds is silent: the music ducks into the cloud (or the window) and comes back out after the
// world has changed, and a new piece never begins in the middle of one (see musicCrossing). Seconds, and the share
// of the level left at the bottom of the duck.
const DUCK = { down: 0.6, up: 1.2, cloud: 0.22, window: 0.5 };
// what is loaded ahead, during the range before it (the visit's order: field, then forest, then sea)
const NEXT: Partial<Record<PieceId, PieceId>> = { field: "forest", forest: "sea" };
// the forest's edge, with room between going in and coming out so it never flickers (Room: inJourneyForest)
const FOREST_IN = 0.55;
const FOREST_OUT = 0.25;
const STORE = "ag-music";

type Now = { key: PieceId };
type Deck = { name: string; v: Voice | null; failed: PieceId | null };
type CrossPhase = "open" | "closing" | "hold" | "opening";

type S = {
  place: Place | null;
  world: string; // the flight's world key
  forest: boolean; // in the home world, the plane is in the forest or by the cave
  deskWant: boolean; // the ambience would have the field's music at the desk now
  muted: boolean;
  flightVol: number; // the flight's own quieting (the kings' wood)
  duck: number; // 1, or the crossing's duck (share of the level left)
  now: Now | null;
  live: number; // which deck has the music (an index into decks)
  decks: Deck[] | null; // three: one sounds, one lets go of what it was, one is loading what comes next
  bus: GainNode | null; // the music's own level, after the decks: the visitor's levels, the kings' wood, the crossing's duck
  gesture: boolean; // the visitor has touched the page: only then does anything start
  wait: boolean; // something is wanted and is waiting for that first touch
  phase: CrossPhase; // the crossing between worlds, as the flight reports it
  pending: boolean; // the flight's piece changed during a crossing: it is taken up when the crossing is over
  failed: Partial<Record<PieceId, boolean>>; // a file that would not load: that piece is silence for the visit
  pos: Partial<Record<PieceId, number>>; // where each piece was left
  log: string[];
  tick: number;
  v: number; // bumped on every change, for React
  leaving: number;
  off: (() => void)[]; // what this module listens to, so a reloaded copy can take over cleanly
};
const G = globalThis as typeof globalThis & { __aosMusic4?: S; __aosMusic3?: { tick: number } };
if (typeof window !== "undefined" && G.__aosMusic3) window.clearInterval(G.__aosMusic3.tick); // (a copy from before a hot reload: its loop watcher goes with it)
const st: S = (G.__aosMusic4 ??= {
  place: null,
  world: "road",
  forest: false,
  deskWant: false,
  muted: false,
  flightVol: 1,
  duck: 1,
  now: null,
  live: 0,
  decks: null,
  bus: null,
  gesture: false,
  wait: false,
  phase: "open",
  pending: false,
  failed: {},
  pos: {},
  log: [],
  tick: 0,
  v: 0,
  leaving: 0,
  off: [],
});

const subs = new Set<() => void>();
const emit = () => {
  st.v++;
  subs.forEach((f) => f());
};
const note = (m: string) => {
  st.log.push(`${(performance.now() / 1000).toFixed(1)} ${m}`);
  if (st.log.length > 60) st.log.shift();
};

function save() {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify({ muted: st.muted }));
  } catch {
    /* not kept */
  }
}

// ---- the decks: voices of the audio manager, owned by nobody (the flight's claim is made for them) ----
// Three of them: one has the music, one is letting go of what it had (a hand-over takes seven seconds, a loop four),
// and one is loading what comes next, so a change of range never waits for a file and never takes a deck that is
// still sounding. They all pour into one bus (the music's level), so a change of level (the visitor's slider, the
// kings' wood, the crossing's duck) never touches a fade that is in progress.
function decks(): Deck[] {
  if (st.decks) return st.decks;
  const mk = (name: string): Deck => {
    const d: Deck = { name, v: voice(`music-${name}`, { channel: "music", scene: true, loop: false }), failed: null };
    d.v?.el.addEventListener("error", () => {
      const src = d.v?.el.getAttribute("src") ?? "";
      const id = (Object.keys(PIECES) as PieceId[]).find((k) => src === PIECES[k].file);
      if (id) onDeckFail(d, id);
    });
    d.v?.el.addEventListener("ended", () => onEnded(d));
    return d;
  };
  st.decks = [mk("a"), mk("b"), mk("c")];
  if (!st.bus && st.decks.every((d) => d.v?.gate)) {
    try {
      const { ctx } = audioGraph();
      const bus = ctx.createGain();
      bus.gain.value = busLevel();
      bus.connect(channel("music"));
      st.decks.forEach((d) => voiceRoute(d.v, bus));
      st.bus = bus;
    } catch {
      st.bus = null;
    }
  }
  return st.decks;
}
const srcOf = (d: Deck) => d.v?.el.getAttribute("src") ?? null;
const volOf = (d: Deck) => (d.v ? (d.v.gain ? d.v.gain.gain.value : d.v.el.volume) : 0);
// (heard at all: playing with some level, whether it is wanted or only letting go)
const sounding = (d: Deck) => !!d.v && !d.v.el.paused && volOf(d) > 0.001;
const timeOf = (d: Deck) => d.v?.el.currentTime ?? 0;
const endOf = (d: Deck) => (Number.isFinite(d.v?.el.duration) ? d.v!.el.duration : 0);
function deckPlay(d: Deck, p: Piece, at: number, fade: number) {
  const v = d.v;
  if (!v) return;
  if (srcOf(d) !== p.file) {
    v.el.src = p.file;
    v.el.preload = "auto";
  }
  const seek = () => {
    try {
      if (Math.abs(v.el.currentTime - at) > 0.5) v.el.currentTime = at;
    } catch {
      /* not seekable yet */
    }
  };
  if (v.el.readyState >= 1) seek();
  else v.el.addEventListener("loadedmetadata", seek, { once: true });
  voicePlay(v, { fade, level: voiceLevel(p.id) });
}
// The deck for a piece that is not being held already: never the one that has the music, and the quietest of the others
// (one that is not sounding at all, and holds nothing that is wanted soon, before one that is only fading).
function spare(keep?: PieceId): Deck {
  const ds = decks();
  const live = ds[st.live];
  const hold = keep ? PIECES[keep].file : null;
  const rank = (d: Deck) => (sounding(d) ? 2 + volOf(d) : srcOf(d) && srcOf(d) === hold ? 1 : srcOf(d) ? 0.5 : 0);
  return ds.filter((d) => d !== live || !st.now).sort((a, b) => rank(a) - rank(b))[0] ?? ds[(st.live + 1) % ds.length];
}
// Load the piece that comes next into a deck of its own while this one plays (paused, silent: only buffered).
function preloadNext() {
  if (typeof window === "undefined" || !st.now || st.place !== "flight" || !st.gesture) return;
  const next = NEXT[st.now.key];
  if (!next || st.failed[next]) return;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return;
  const file = PIECES[next].file;
  const ds = decks();
  if (ds.some((d) => srcOf(d) === file)) return;
  const d = spare(st.now.key);
  if (!d.v || sounding(d) || d === ds[st.live]) return;
  d.v.el.preload = "auto";
  d.v.el.src = file;
  note(`loading ${next} ahead on deck ${d.name}`);
}

// ---- what should be heard now ----
const silent = () => st.muted || sceneMuted();
export function pieceOf(place: Place, world: string, forest: boolean): PieceId {
  if (place === "desk" || world === "home") return "field";
  if (world === "road") return forest ? "forest" : "field";
  return SEA_RANGE.has(world) ? "sea" : "forest";
}
function resolve(): Now | null {
  if (!st.place) return null;
  const key = pieceOf(st.place, st.world, st.forest);
  return st.failed[key] ? null : { key };
}

// The music's level is the bus's (the visitor's levels under the master, the flight's own quieting, the crossing's
// duck); a deck only carries its piece's own level. Without a Web Audio bus the deck carries all of it.
const busLevel = () => Math.min(1.4, masterGain() * fieldMusicGain() * (st.place === "flight" ? st.flightVol : 1) * st.duck);
const voiceLevel = (id: PieceId) => (st.bus ? PIECES[id].level : Math.min(1.4, PIECES[id].level * busLevel()));
function setBus(seconds: number) {
  if (st.bus) fadeParam(st.bus.gain, busLevel(), seconds);
  else if (st.now) voicePlay(decks()[st.live].v, { fade: seconds, level: voiceLevel(st.now.key) });
}
// in flight the music is the flight's, as a voice of its own would be; at the desk it is background nobody owns
const owned = () => externalMusic(st.place === "flight" ? "flight" : null, st.place === "flight");

function leave(now: Now, fade: number) {
  st.leaving++;
  try {
    const d = decks()[st.live];
    if (srcOf(d) === PIECES[now.key].file) st.pos[now.key] = timeOf(d);
    voiceStop(d.v, fade);
  } finally {
    st.leaving--;
  }
}

// Bring what is heard into line with what should be heard.
function apply(fade?: number) {
  if (typeof window === "undefined") return;
  const want = silent() ? null : resolve();
  const cur = st.now;
  if (!want) {
    st.wait = false;
    st.pending = false;
    if (cur) {
      note(`out: ${cur.key}`);
      leave(cur, fade ?? FADE.out);
      st.now = null;
    }
    externalMusic(null, false);
    watching(false);
    return emit();
  }
  // nothing starts before the visitor has touched the page (the browser would refuse it, and the sky and the ambience
  // would be told there was music): it waits, and starts with the first touch
  if (!cur && !armed()) {
    if (!st.wait) note(`${want.key}: waiting for a touch`);
    st.wait = true;
    return emit();
  }
  st.wait = false;
  st.gesture = true; // (armed: the page has been touched, if not by anything this module heard)
  const f = fade ?? FADE.change;
  const ds = decks();
  if (cur && cur.key === want.key) {
    // the same piece carries on: only its level leans (and who owns it, as the plane goes up or comes down)
    st.now = want;
    st.pending = false;
    setBus(1.2);
    owned();
    preloadNext();
    return emit();
  }
  // the flight's piece changes while the cloud is over a crossing: the new one waits for the crossing to be over
  if (cur && st.place === "flight" && st.phase !== "open") {
    if (!st.pending) note(`${want.key}: after the crossing`);
    st.pending = true;
    return emit();
  }
  st.pending = false;
  if (cur) leave(cur, f);
  st.now = want;
  const p = PIECES[want.key];
  // A deck that still holds this piece (loaded ahead, left a moment ago and still fading, or paused where it was)
  // takes it up; otherwise the quietest spare deck takes it, and the others are left as they are.
  const held = ds.findIndex((d, i) => srcOf(d) === p.file && !(cur && i === st.live));
  const next = held >= 0 ? held : ds.indexOf(spare(NEXT[want.key]));
  st.live = next;
  const d = ds[next];
  const turning = held === next && sounding(d);
  let at = turning ? timeOf(d) : (st.pos[want.key] ?? 0);
  const end = endOf(d);
  if (end > 0 && at > end - p.x - 1) at = 0;
  note(`in: ${want.key} @${Math.round(at)}s${turning ? " (turned round)" : held >= 0 ? " (was loaded)" : ""}`);
  resumeAudio();
  deckPlay(d, p, at, f);
  setBus(0.6);
  owned();
  watching(true);
  preloadNext();
  emit();
}

function onDeckFail(d: Deck, id: PieceId) {
  note(`${id} would not load on deck ${d.name}`);
  st.failed[id] = true;
  if (st.now?.key === id) {
    st.now = null;
    externalMusic(null, false);
    apply(FADE.press);
  } else emit();
}
function onEnded(d: Deck) {
  // (the seam is normally crossed before the end: see watching; this is the safety net)
  const now = st.now;
  if (!now || decks()[st.live] !== d) return;
  deckPlay(d, PIECES[now.key], 0, 0.8);
}

// While something plays: remember where it is, and loop it without a seam.
function watching(on: boolean) {
  window.clearInterval(st.tick);
  st.tick = 0;
  if (!on) return;
  st.tick = window.setInterval(() => {
    const now = st.now;
    if (!now) return;
    const ds = decks();
    const d = ds[st.live];
    if (!d.v || d.v.el.paused) return;
    const p = PIECES[now.key];
    const t = timeOf(d);
    st.pos[now.key] = t;
    const end = endOf(d);
    if (end <= p.x * 2 || t < end - p.x) return;
    // a breath before its end another deck takes it up from the beginning, the two crossing (unless every other
    // deck is still letting something go: then on the next tick)
    const o = spare(NEXT[now.key]);
    if (o === d || sounding(o)) return;
    note(`loop: ${now.key}`);
    voiceStop(d.v, p.x);
    st.live = ds.indexOf(o);
    deckPlay(o, p, 0, p.x);
    st.pos[now.key] = 0;
    preloadNext();
  }, 250);
}

// The first touch: from here the browser lets sound start. Whatever was wanted before it starts now.
function touched() {
  if (st.gesture) return;
  st.gesture = true;
  note("touched");
  resumeAudio();
  decks().forEach((d) => voicePrime(d.v));
  if (st.wait) apply();
}
const armed = () => st.gesture || (typeof navigator !== "undefined" && !!(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive);

// ---- the calls the rest of the site makes ----
// the ambience: the field's music is wanted at the desk now, or not
function desk(on: boolean, fade: number) {
  st.deskWant = on;
  if (st.place === "flight") return; // the flight has the music (and the landing hands back: musicFlightStop)
  if (on) {
    if (st.place === "desk" && st.now) return;
    st.place = "desk";
    note("desk: on");
    apply(fade);
  } else if (st.place === "desk") {
    st.place = null;
    note("desk: off");
    apply(fade);
  }
}
export function musicFlight(key: string) {
  if (typeof window === "undefined") return;
  if (st.place === "flight" && st.world === key) return;
  st.place = "flight";
  st.world = key;
  note(`flight: ${key}`);
  apply(FADE.change);
}
// Landing (home = true): the field's music carries on, or comes back, as the plane comes down to the desk.
// Otherwise (somebody else took the music, the room went away) the flight's music simply leaves.
export function musicFlightStop(fade = FADE.change, home = true) {
  if (typeof window === "undefined" || st.place !== "flight") return;
  st.flightVol = 1;
  st.forest = false;
  // (a crossing that was under way is over: the cloud has nothing to do with the desk)
  st.phase = "open";
  st.pending = false;
  st.duck = 1;
  st.place = home && st.deskWant ? "desk" : null;
  note(`flight: stop${st.place ? " (to the field)" : ""}`);
  apply(fade);
}
// How far into the home world's forest the plane is, 0..1 (Room, every frame while it flies at home).
export function musicForest(k: number) {
  const inside = st.forest ? k > FOREST_OUT : k > FOREST_IN;
  if (inside === st.forest) return;
  st.forest = inside;
  note(inside ? "into the forest" : "out of the forest");
  if (st.place === "flight") apply(FADE.change);
}
export function musicFlightVolume(v: number) {
  if (typeof window === "undefined") return;
  st.flightVol = v;
  if (st.place !== "flight" || !st.now) return;
  setBus(0.6);
}

// The crossing between worlds, as the flight's cloud reports it each frame ("open" in clear air). A crossing is
// silent: the music ducks into the cloud (0.6 s down) and comes back out once the world has changed (1.2 s up), never
// to nothing, and a piece that is due to change waits for the crossing to be over, then crosses over slowly as always.
// A window (the gate shows the next world and the plane goes straight through) has no cloud: a shallower dip.
export function musicCrossing(phase: CrossPhase) {
  if (typeof window === "undefined" || phase === st.phase) return;
  const was = st.phase;
  st.phase = phase;
  if (st.place !== "flight") return;
  if (phase === "closing" || phase === "hold") {
    if (st.duck === DUCK.cloud) return;
    st.duck = DUCK.cloud;
    note("crossing: down");
    setBus(DUCK.down);
  } else if (phase === "opening" && was === "open") {
    // through a window: down a little and up again, scheduled whole
    note("crossing: window");
    st.duck = 1;
    if (st.bus) {
      const { ctx } = audioGraph();
      const g = st.bus.gain;
      const t = ctx.currentTime;
      const top = busLevel();
      const from = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(from, t);
      const N = 8;
      for (let k = 1; k <= N; k++) g.linearRampToValueAtTime(from + (top * DUCK.window - from) * (1 - Math.cos((k / N) * Math.PI * 0.5)), t + (DUCK.down * k) / N);
      for (let k = 1; k <= N; k++) g.linearRampToValueAtTime(top * DUCK.window + (top - top * DUCK.window) * Math.sin((k / N) * Math.PI * 0.5), t + DUCK.down + (DUCK.up * k) / N);
    }
  } else {
    // the world has changed: up again (and when it is over, the piece that was waiting)
    if (st.duck !== 1) note("crossing: up");
    st.duck = 1;
    setBus(DUCK.up);
    if (phase === "open" && st.pending) apply();
  }
}
// (inside a tap: both decks play their moment of silence, so either may start a file later without one)
export function musicPrime() {
  if (typeof window === "undefined") return;
  if (!st.gesture) return touched();
  resumeAudio();
  decks().forEach((d) => voicePrime(d.v));
}

// the music's level: the shared one (lib/soundSettings.ts), for the field and the flight alike
export function setMusicVolume(v: number) {
  setSoundSettings({ fieldMusic: v });
}
export function setMusicMuted(m: boolean) {
  st.muted = m;
  save();
  note(m ? "muted" : "unmuted");
  apply(m ? 0.6 : FADE.press);
}

export type MusicView = { place: Place | null; playing: Piece | null; volume: number; muted: boolean; v: number };
let snap: MusicView | null = null;
let snapV = -1;
function view(): MusicView {
  if (snap && snapV === st.v) return snap;
  snapV = st.v;
  snap = { place: st.place, playing: st.now ? PIECES[st.now.key] : null, volume: getSoundSettings().fieldMusic, muted: st.muted, v: st.v };
  return snap;
}
const SERVER: MusicView = { place: null, playing: null, volume: 0.7, muted: false, v: 0 };
export const useMusic = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    view,
    () => SERVER,
  );

// ---- wiring: once per page (a reloaded module takes the listeners over from the old one) ----
let kept = false;
function init() {
  if (typeof window === "undefined") return;
  (st.off ??= []).forEach((f) => f());
  st.off = [];
  st.leaving = 0;
  if (!kept) {
    kept = true;
    try {
      const k = JSON.parse(window.sessionStorage.getItem(STORE) ?? "null") as { muted?: boolean } | null;
      if (k) st.muted = !!k.muted;
    } catch {
      /* nothing kept */
    }
  }
  // the desk's background music is asked for and sent away by the ambience (and primed inside its gestures)
  setDeskMusic(desk, musicPrime);
  // the first touch lets sound start (a touch screen counts a finger only when it lifts)
  if (!st.gesture) {
    const first = (e: Event) => {
      if (e.type === "pointerdown" && (e as PointerEvent).pointerType !== "mouse") return;
      go();
      touched();
    };
    const EV = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    const go = () => EV.forEach((n) => window.removeEventListener(n, first, true));
    EV.forEach((n) => window.addEventListener(n, first, true));
    st.off.push(go);
  }
  st.off.push(
    // somebody else takes the music (the headphones, the OS's player): ours leaves as a voice would
    onMusicClaim((owner) => {
      if (owner === "flight" || !st.now) return;
      // (the desk's music is asked for again by the ambience once they have finished)
      note(`${owner} took the music`);
      st.place = null;
      apply(0.8);
    }),
    onOwnerStop((owner, fade) => {
      if (owner === "flight" && st.place === "flight" && !st.leaving) musicFlightStop(fade, false);
    }),
    onMuteChange(() => apply(0.4)),
    // the visitor's levels (the scene's slider, the OS's Settings): what is playing leans to them
    subscribeSoundSettings(() => {
      if (st.now) setBus(0.15);
      emit();
    }),
  );
}
if (typeof window !== "undefined") {
  init();
  if (process.env.NODE_ENV !== "production") {
    const report = () => ({
      place: st.place,
      world: st.world,
      forest: st.forest,
      deskWant: st.deskWant,
      piece: st.place ? pieceOf(st.place, st.world, st.forest) : null,
      now: st.now?.key ?? null,
      silent: silent(),
      muted: st.muted,
      gesture: st.gesture,
      wait: st.wait,
      phase: st.phase,
      pending: st.pending,
      duck: st.duck,
      bus: st.bus ? +st.bus.gain.value.toFixed(3) : null,
      sceneMuted: sceneMuted(),
      hushed: audioHushed(),
      flightVol: st.flightVol,
      failed: st.failed,
      sound: getSoundSettings(),
      live: st.live,
      decks: (st.decks ?? []).map((d) => ({ deck: d.name, src: (srcOf(d) ?? "").split("/").pop(), paused: d.v?.el.paused ?? null, want: d.v?.want ?? null, t: +timeOf(d).toFixed(1), level: d.v?.level ?? null, gain: +volOf(d).toFixed(3), ready: d.v?.el.readyState ?? null })),
      pos: Object.fromEntries(Object.entries(st.pos).map(([k, v]) => [k, Math.round(v ?? 0)])),
      log: st.log.slice(-14),
    });
    Object.assign(window, { __music: { report, state: st, forest: musicForest, crossing: musicCrossing, flight: musicFlight, stop: musicFlightStop, prime: musicPrime, volume: setMusicVolume, mute: setMusicMuted, sound: setSoundSettings, pieces: PIECES } });
  }
}
