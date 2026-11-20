import { useSyncExternalStore } from "react";
import { audioHushed, channel, externalMusic, onMusicClaim, onMuteChange, onOwnerStop, resumeAudio, sceneMuted, setDeskMusic, voice, voicePlayUrl, voicePrime, voiceStop, type Voice } from "@/lib/audio";
import { FLIGHT_CREDIT, hostedFlightActive, hostedFlightPrime, hostedFlightStop, hostedFlightTo, hostedFlightVolume } from "@/lib/flightHosted";
import { makeDeck, type Deck } from "@/lib/stream";

// The music of the 3D world: what plays, where, and how it hands over.
//
//   place    what is heard by default                         who asks for it
//   desk     "Spring Fields Ambience and Music" by Martia's   the ambience (lib/ambience.ts), through the
//            Muses, quietly, as the field's own music          "desk-music" voice, once the visitor has clicked
//   flight   Čiurlionis's two symphonic poems, by world:      Room, through flightMusicTo(key) on take-off and
//            Miške (In the Forest) for the forest avenue and   in every world, flightMusicStop() on landing
//            the wooded worlds, Jūra (The Sea) for the rest,
//            each world at a section of its own
//
// Those are official uploads played through the embedded YouTube player
// (lib/stream.ts): never downloaded, never rehosted. When a stream cannot
// play (the embed or autoplay refused, no network, a blocker), the music we
// host takes over without a word: in flight The Sea, VL 317, played by Jean
// Dubé, dealt to the worlds by movement (lib/flightHosted.ts); at the desk his
// Prelude, VL 268. Both are CC BY 4.0: their credit stands in the mini-player
// for as long as they play. Augustas's own Nocturne and Afterlight play only
// when they are chosen in the picker, never by default.
//
// One thing plays at a time, across the whole site. In flight the music is the
// owner "flight" of the audio manager whether it is a stream or a file (the
// headphones and the OS's player fade out for it, the ambience ducks under it,
// and it stops when they start or when the room is left); at the desk it is
// background that nobody owns, and it leaves the moment anything else plays.
// Every change is a ramp: two decks cross over six seconds between worlds.
//
// The picker (scene/music/MusicDock.tsx): choose any of the above; the choice
// is kept for the visit (one for the desk, one for the flight); a volume; a mute.
//
// Development: window.__music.report() (states, volumes, what was asked for
// and why), .pick(id), .volume(v), .mute(on), .fail(deck) to rehearse a fallback.

export type TrackId = "worlds" | "miske" | "jura" | "jura-live" | "spring" | "sea-dube" | "prelude-dube" | "nocturne" | "afterlight";
export type Place = "desk" | "flight";
export type Track = {
  id: TrackId;
  title: string;
  by: string; // who plays it
  source: string; // where it comes from, as shown
  kind: "worlds" | "yt" | "sea" | "file";
  video?: string;
  file?: string;
  credit?: string; // a licence that asks to be named
  url?: string; // where the upload lives
  flightOnly?: boolean;
};

// The official uploads (each checked: public, embedding allowed, playable in an embed):
//   R-3c28gbx34  "In the Forest", Lithuanian National Symphony Orchestra / Modestas Pitrėnas, from the album
//                "Čiurlionis: The Sea, In the Forest & Kęstutis" (℗ 2020 Ondine), provided to YouTube by NAXOS of
//                America on the label's behalf (the orchestra's auto-generated Topic channel)
//   3kGTf5yXW1g  "The Sea", the same album and performers (with Evelina Staniulytė, organ)
//   89o4wK16g3E  "Jūra" live, LNSO / Mirga Gražinytė-Tyla, on the Lithuanian National Philharmonic's own channel
//   6ksK2rqrjZk  "Spring Fields Ambience and Music", on its maker's own channel (Martia's Muses)
const VIDEO = { miske: "R-3c28gbx34", jura: "3kGTf5yXW1g", juraLive: "89o4wK16g3E", spring: "6ksK2rqrjZk" };
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const TRACKS: Track[] = [
  { id: "worlds", title: "Miške and Jūra, by world", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "worlds", flightOnly: true },
  { id: "miske", title: "Miške (In the Forest)", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "yt", video: VIDEO.miske, url: yt(VIDEO.miske) },
  { id: "jura", title: "Jūra (The Sea)", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "yt", video: VIDEO.jura, url: yt(VIDEO.jura) },
  { id: "jura-live", title: "Jūra, live in Vilnius", by: "Lithuanian National Symphony Orchestra, Mirga Gražinytė-Tyla", source: "YouTube · Lietuvos nacionalinė filharmonija", kind: "yt", video: VIDEO.juraLive, url: yt(VIDEO.juraLive) },
  { id: "spring", title: "Spring Fields Ambience and Music", by: "Martia's Muses", source: "YouTube · Martia's Muses", kind: "yt", video: VIDEO.spring, url: yt(VIDEO.spring) },
  { id: "sea-dube", title: "The Sea, VL 317", by: "M. K. Čiurlionis · Jean Dubé, piano", source: "Hosted here", kind: "sea", credit: "Jean Dubé, piano · CC BY 4.0" },
  { id: "prelude-dube", title: "Prelude, VL 268", by: "M. K. Čiurlionis · Jean Dubé, piano", source: "Hosted here", kind: "file", file: "/content/music/ciurlionis-prelude-vl268-dube.mp3", credit: "Jean Dubé, piano · CC BY 4.0" },
  { id: "nocturne", title: "Nocturne for Absent Things", by: "Augustas Armalis", source: "His own", kind: "file", file: "/content/music/nocturne-for-absent-things.mp3" },
  { id: "afterlight", title: "Afterlight", by: "Augustas Armalis", source: "His own", kind: "file", file: "/content/music/afterlight.m4a" },
];
const trackOf = (id: TrackId) => TRACKS.find((t) => t.id === id)!;

// Each world's own place in the two poems (seconds into the Ondine recordings). Neighbouring worlds never share
// one. The sections are placed from the works' published section lengths (the Deutsche Grammophon edition lists
// them), scaled to these recordings: close, not to the bar. `home` (the way back out of the kings' light) carries on.
//   Miške  I main theme, Lento assai 0:00 · II bridge 2:46 · III second theme, Andante cantabile 4:46 ·
//          IV development 8:09 · V reversed recapitulation 10:08 · VI main theme returns 13:41
//   Jūra   I main theme 0:00 · II second theme 6:47 · III development 12:10 · IV the storm 13:59 ·
//          V recapitulation 18:02 · VI inner recapitulation 23:11 · VII coda 29:58
export const WORLD_MUSIC: Record<string, { video: string; at: number; gain?: number; part: string }> = {
  road: { video: VIDEO.miske, at: 0, part: "Miške: the forest wakes" },
  forest: { video: VIDEO.miske, at: 0, part: "Miške: the forest wakes" },
  sun: { video: VIDEO.jura, at: 2, part: "Jūra: the main theme" },
  stars: { video: VIDEO.jura, at: 410, gain: 0.9, part: "Jūra: the second theme" },
  rex: { video: VIDEO.jura, at: 1394, part: "Jūra: the inner recapitulation" },
  fairy: { video: VIDEO.jura, at: 1084, part: "Jūra: the recapitulation" },
  paradise: { video: VIDEO.miske, at: 288, gain: 0.92, part: "Miške: Andante espressivo e cantabile" },
  gate: { video: VIDEO.jura, at: 841, gain: 0.9, part: "Jūra: the storm" },
  sea: { video: VIDEO.jura, at: 1799, gain: 0.8, part: "Jūra: the coda" },
  funeral: { video: VIDEO.jura, at: 731, gain: 0.7, part: "Jūra: the development" },
  kings: { video: VIDEO.miske, at: 823, gain: 0.85, part: "Miške: the main theme returns" },
};

// How loud. A stream is levelled by its player's volume (0..1); a file by its voice in the graph. Both are
// multiplied by the visitor's volume (the slider), which is 1 at its middle mark.
const LEVEL = { deskStream: 0.13, flightStream: 0.46, deskFile: 0.3, flightFile: 0.85 };
const FADE = { world: 6, desk: 4, out: 2.5, pick: 1.6 };
const DEFAULT: Record<Place, TrackId> = { desk: "spring", flight: "worlds" };
const STORE = "ag-music";

type Now =
  | { kind: "yt"; key: string; video: string; at: number; level: number; track: TrackId; part?: string }
  | { kind: "file"; key: string; file: string; level: number; track: TrackId }
  | { kind: "sea"; key: string; track: TrackId; level: number };

type S = {
  place: Place | null;
  world: string; // the flight's world key
  choice: Partial<Record<Place, TrackId>>;
  volume: number; // 0..1, the slider (0.7 is the calibrated level)
  muted: boolean;
  flightVol: number; // the flight's own quieting (the kings' wood)
  now: Now | null;
  live: 0 | 1; // which deck has the stream
  decks: [Deck, Deck] | null;
  blocked: boolean; // streams have failed on this page: the hosted music stands in
  lastFail: string | null;
  pos: Record<string, number>; // where each stream was left
  hidden: boolean;
  log: string[];
  tick: number;
  open: boolean; // the mini-player is opened out
  v: number; // bumped on every change, for React
  leaving: number; // (the hosted engine lets go through stopOwner, which we also listen to: not while we are the ones stopping it)
  off: (() => void)[]; // what this module listens to, so a reloaded copy can take over cleanly
};
const G = globalThis as typeof globalThis & { __aosMusic?: S };
const st: S = (G.__aosMusic ??= {
  place: null,
  world: "road",
  choice: {},
  volume: 0.7,
  muted: false,
  flightVol: 1,
  now: null,
  live: 0,
  decks: null,
  blocked: false,
  lastFail: null,
  pos: {},
  hidden: false,
  log: [],
  tick: 0,
  open: false,
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
const gainOf = () => Math.min(1.6, st.volume / 0.7);

function save() {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify({ choice: st.choice, volume: st.volume, muted: st.muted }));
  } catch {
    /* not kept */
  }
}

function decks(): [Deck, Deck] {
  if (st.decks) return st.decks;
  const mk = (n: string) => {
    const d = makeDeck(n);
    d.onState = onDeckState;
    d.onFail = onDeckFail;
    return d;
  };
  st.decks = [mk("a"), mk("b")];
  return st.decks;
}
// the mini-player: where the frames are seen, what is playing is named, and something else can be chosen
let docked = false;
function dock() {
  if (docked) return;
  docked = true;
  void import("@/components/scene/music/MusicDock").then((m) => m.mountMusicDock()).catch(() => (docked = false));
}
const bgVoice = () => voice("music-bg", { channel: "music", scene: true, loop: true });
const pickVoice = () => voice("music-pick", { channel: "flight", owner: "flight", scene: true, loop: true });

// ---- what should be heard now ----
const silent = () => st.muted || sceneMuted() || st.hidden;
function resolve(): Now | null {
  const place = st.place;
  if (!place) return null;
  const id = st.choice[place] ?? DEFAULT[place];
  const t = trackOf(id);
  const stream = place === "desk" ? LEVEL.deskStream : LEVEL.flightStream;
  const file = place === "desk" ? LEVEL.deskFile : LEVEL.flightFile;
  if (t.kind === "worlds") {
    if (st.blocked) return { kind: "sea", key: `sea:${st.world}`, track: "sea-dube", level: 1 };
    // (a world that has not been given a place of its own yet takes the avenue's)
    const w = WORLD_MUSIC[st.world] ?? WORLD_MUSIC.road;
    return { kind: "yt", key: `w:${st.world}`, video: w.video, at: w.at, level: stream * (w.gain ?? 1), track: "worlds", part: w.part };
  }
  if (t.kind === "yt") {
    if (st.blocked) return place === "flight" ? { kind: "sea", key: `sea:${st.world}`, track: "sea-dube", level: 1 } : { kind: "file", key: "f:prelude-dube", file: trackOf("prelude-dube").file!, level: file, track: "prelude-dube" };
    return { kind: "yt", key: `v:${t.video}`, video: t.video!, at: 0, level: stream, track: id };
  }
  if (t.kind === "sea") return place === "flight" ? { kind: "sea", key: `sea:${st.world}`, track: id, level: 1 } : { kind: "file", key: "f:sea", file: "/content/music/ciurlionis-jura-dube.mp3", level: file, track: id };
  return { kind: "file", key: `f:${id}`, file: t.file!, level: file, track: id };
}

const streamLevel = (n: Now & { kind: "yt" }) => Math.min(1, n.level * gainOf() * (st.place === "flight" ? st.flightVol : 1));
const fileLevel = (n: Now & { kind: "file" }) => Math.min(1.2, n.level * gainOf());

function leave(now: Now, fade: number) {
  st.leaving++;
  try {
    leave1(now, fade);
  } finally {
    st.leaving--;
  }
}
function leave1(now: Now, fade: number) {
  if (now.kind === "yt") {
    const d = decks()[st.live];
    if (d.videoId) st.pos[now.key] = d.time();
    d.stop(fade);
  } else if (now.kind === "file") {
    voiceStop(bgVoice(), fade);
    voiceStop(pickVoice(), fade);
  } else hostedFlightStop(Math.max(fade, 1.2));
}

// Bring what is heard into line with what should be heard.
function apply(fade?: number) {
  if (typeof window === "undefined") return;
  const want = silent() ? null : resolve();
  const cur = st.now;
  if (!want) {
    if (cur) {
      note(`out: ${cur.key}`);
      leave(cur, fade ?? FADE.out);
      st.now = null;
    }
    externalMusic(null, false);
    watching(false);
    return emit();
  }
  dock();
  const f = fade ?? (st.place === "desk" ? FADE.desk : FADE.world);
  if (cur && cur.key === want.key && cur.kind === want.kind) {
    // the same thing carries on: only its level leans
    st.now = want;
    if (want.kind === "yt") decks()[st.live].fade(streamLevel(want), 1.2);
    else if (want.kind === "file") voicePlayUrl(st.place === "flight" ? pickVoice() : bgVoice(), want.file, { fade: 1.2, level: fileLevel(want) });
    else hostedFlightVolume(st.flightVol * gainOf());
    return emit();
  }
  // the same poem in the hosted engine moves between its own movements by itself
  if (cur && cur.kind === "sea" && want.kind === "sea") {
    st.now = want;
    hostedFlightTo(st.world);
    return emit();
  }
  if (cur) leave(cur, f);
  st.now = want;
  note(`in: ${want.key}${want.kind === "yt" ? ` @${Math.round(st.pos[want.key] ?? want.at)}s` : ""}`);
  if (want.kind === "yt") {
    const next = (cur && cur.kind === "yt" ? 1 - st.live : st.live) as 0 | 1;
    st.live = next;
    const d = decks()[next];
    d.fade(0, 0);
    // a stream left earlier is taken up where it was (a world's section within the same flight, the desk's for the visit)
    const at = st.pos[want.key] ?? want.at;
    d.play(want.video, at);
    // (its level comes up when it is really playing: see onDeckState)
  } else if (want.kind === "file") {
    resumeAudio();
    voicePlayUrl(st.place === "flight" ? pickVoice() : bgVoice(), want.file, { fade: f, level: fileLevel(want) });
    externalMusic(null, false);
  } else {
    externalMusic(null, false);
    hostedFlightVolume(st.flightVol * gainOf());
    hostedFlightTo(st.world);
  }
  watching(true);
  emit();
}

function onDeckState(d: Deck) {
  const ds = decks();
  const now = st.now;
  const mine = now && now.kind === "yt" && ds[st.live] === d;
  if (mine && d.state === "playing") {
    if (d.to < 0.001 || d.vol < 0.001) d.fade(streamLevel(now), st.place === "desk" ? FADE.desk : FADE.world);
    // in flight the stream is the music's owner, as a file would be
    externalMusic(st.place === "flight" ? "flight" : null, st.place === "flight");
  } else if (mine && d.state === "ended") {
    // a recording that runs out begins again at its world's own place
    d.play(now.video, now.at);
  }
  emit();
}
function onDeckFail(d: Deck, why: string) {
  note(`stream failed on deck ${d.name}: ${why}`);
  st.lastFail = why;
  const now = st.now;
  if (!now || now.kind !== "yt" || decks()[st.live] !== d) return emit();
  // the hosted music stands in, for the rest of this page (and nothing of the stream is left sounding under it)
  d.stop(0.4);
  st.blocked = true;
  st.now = null;
  externalMusic(null, false);
  apply(FADE.pick);
}

// While something plays: remember where streams are, keep a section's loop, keep the owner flag true to what is heard.
function watching(on: boolean) {
  window.clearInterval(st.tick);
  st.tick = 0;
  if (!on) return;
  st.tick = window.setInterval(() => {
    const now = st.now;
    if (!now) return;
    if (now.kind === "yt") {
      const d = decks()[st.live];
      if (d.state === "playing") {
        st.pos[now.key] = d.time();
        const dur = d.duration();
        // a breath before the end, go back to this world's own place under a dip (the end itself is caught by "ended")
        if (dur > 30 && d.time() > dur - 1.5) d.seek(now.at);
      }
    }
  }, 1000);
}

// ---- the calls the rest of the site makes ----
function desk(on: boolean, fade: number) {
  if (on) {
    if (st.place === "flight") return; // the flight has the music
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
  st.place = "flight";
  // (the way home out of the kings' light keeps whatever was playing)
  if (key !== "home") st.world = key;
  note(`flight: ${key}`);
  apply();
}
export function musicFlightStop(fade = 5) {
  if (typeof window === "undefined" || st.place !== "flight") return;
  st.place = null;
  st.flightVol = 1;
  note("flight: stop");
  apply(fade);
  // the next flight finds every world's section at its beginning again
  for (const k of Object.keys(st.pos)) if (k.startsWith("w:")) delete st.pos[k];
}
export function musicFlightVolume(v: number) {
  if (typeof window === "undefined") return;
  st.flightVol = v;
  const now = st.now;
  if (st.place !== "flight" || !now) return;
  if (now.kind === "yt") decks()[st.live].fade(streamLevel(now), 0.6);
  else if (now.kind === "sea") hostedFlightVolume(v * gainOf());
  else channel("flight").gain.setTargetAtTime(v, channel("flight").context.currentTime, 0.2);
}
// (inside a tap that will lead to a flight: the hosted decks are woken so they may start later without one)
export function musicPrime() {
  if (typeof window === "undefined") return;
  hostedFlightPrime();
  voicePrime(pickVoice());
}

// ---- the picker ----
export function pickTrack(id: TrackId) {
  const place = st.place ?? "desk";
  st.choice[place] = id;
  // choosing something is asking for sound, and a stream that failed earlier is given another chance
  st.muted = false;
  if (trackOf(id).kind === "yt" || trackOf(id).kind === "worlds") st.blocked = false;
  note(`picked ${id} for the ${place}`);
  save();
  apply(FADE.pick);
}
export function setMusicVolume(v: number) {
  st.volume = Math.min(1, Math.max(0, v));
  save();
  const now = st.now;
  if (now?.kind === "yt") decks()[st.live].fade(streamLevel(now), 0.15);
  else if (now?.kind === "file") voicePlayUrl(st.place === "flight" ? pickVoice() : bgVoice(), now.file, { fade: 0.15, level: fileLevel(now) });
  else if (now?.kind === "sea") hostedFlightVolume(st.flightVol * gainOf());
  emit();
}
export function setMusicMuted(m: boolean) {
  st.muted = m;
  save();
  note(m ? "muted" : "unmuted");
  apply(m ? 0.6 : FADE.pick);
}
export function setMusicOpen(open: boolean) {
  st.open = open;
  emit();
}

export type MusicView = { place: Place | null; choice: TrackId; playing: Track | null; part: string | null; kind: Now["kind"] | null; state: string; volume: number; muted: boolean; open: boolean; fallback: boolean; credit: string | null; v: number };
let snap: MusicView | null = null;
let snapV = -1;
function view(): MusicView {
  if (snap && snapV === st.v) return snap;
  snapV = st.v;
  const now = st.now;
  const place = st.place;
  const playing = now ? trackOf(now.kind === "sea" ? "sea-dube" : now.track === "worlds" ? (now.kind === "yt" && now.video === VIDEO.miske ? "miske" : "jura") : now.track) : null;
  const d = now?.kind === "yt" && st.decks ? st.decks[st.live] : null;
  snap = {
    place,
    choice: place ? (st.choice[place] ?? DEFAULT[place]) : DEFAULT.desk,
    playing,
    part: now?.kind === "yt" ? (now.part ?? null) : null,
    kind: now?.kind ?? null,
    state: d ? d.state : now ? "playing" : "idle",
    volume: st.volume,
    muted: st.muted,
    open: st.open,
    fallback: st.blocked,
    credit: now?.kind === "sea" ? FLIGHT_CREDIT : (playing?.credit ?? null),
    v: st.v,
  };
  return snap;
}
const SERVER: MusicView = { place: null, choice: "spring", playing: null, part: null, kind: null, state: "idle", volume: 0.7, muted: false, open: false, fallback: false, credit: null, v: 0 };
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
      const k = JSON.parse(window.sessionStorage.getItem(STORE) ?? "null") as { choice?: S["choice"]; volume?: number; muted?: boolean } | null;
      if (k) {
        st.choice = k.choice ?? {};
        if (typeof k.volume === "number") st.volume = k.volume;
        st.muted = !!k.muted;
      }
    } catch {
      /* nothing kept */
    }
  }
  st.decks?.forEach((d) => {
    d.onState = onDeckState;
    d.onFail = onDeckFail;
  });
  // the desk's background music is asked for and sent away by the ambience
  setDeskMusic(desk, () => {
    // (inside the first gesture: the hosted stand-in may start later without one)
    voicePrime(bgVoice());
  });
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
      if (owner === "flight" && st.place === "flight" && !st.leaving) musicFlightStop(fade);
    }),
    onMuteChange(() => apply(0.4)),
  );
  const vis = () => {
    const hidden = document.visibilityState !== "visible";
    if (hidden === st.hidden) return;
    st.hidden = hidden;
    apply(hidden ? 0.3 : 1.5);
  };
  document.addEventListener("visibilitychange", vis);
  st.off.push(() => document.removeEventListener("visibilitychange", vis));
}
if (typeof window !== "undefined") {
  init();
  if (process.env.NODE_ENV !== "production") {
    const report = () => ({
      place: st.place,
      world: st.world,
      choice: { desk: st.choice.desk ?? DEFAULT.desk, flight: st.choice.flight ?? DEFAULT.flight },
      now: st.now,
      silent: silent(),
      muted: st.muted,
      sceneMuted: sceneMuted(),
      hushed: audioHushed(),
      volume: st.volume,
      flightVol: st.flightVol,
      blocked: st.blocked,
      lastFail: st.lastFail,
      live: st.live,
      decks: st.decks?.map((d) => d.report()) ?? [],
      hostedFlight: hostedFlightActive(),
      files: [bgVoice(), pickVoice()].map((v: Voice | null) => (v ? { id: v.id, paused: v.el.paused, want: v.want, target: v.level, gain: v.gain ? +v.gain.gain.value.toFixed(3) : null, src: (v.el.getAttribute("src") ?? "").split("/").pop() } : null)),
      pos: Object.fromEntries(Object.entries(st.pos).map(([k, v]) => [k, Math.round(v)])),
      log: st.log.slice(-14),
    });
    Object.assign(window, {
      __music: {
        report,
        state: st,
        pick: pickTrack,
        volume: setMusicVolume,
        mute: setMusicMuted,
        tracks: TRACKS,
        worlds: WORLD_MUSIC,
        // rehearse a refused stream: the hosted music must take over
        fail: () => st.decks && onDeckFail(st.decks[st.live], "rehearsed failure"),
        unblock: () => {
          st.blocked = false;
          apply();
        },
      },
    });
  }
}
