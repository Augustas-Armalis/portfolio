import { useSyncExternalStore } from "react";
import { audioHushed, channel, externalMusic, onMusicClaim, onMuteChange, onOwnerStop, resumeAudio, sceneMuted, setDeskMusic, voice, voicePlayUrl, voicePrime, voiceStop, type Voice } from "@/lib/audio";
import { FLIGHT_CREDIT, hostedFlightActive, hostedFlightPrime, hostedFlightStop, hostedFlightTo, hostedFlightVolume } from "@/lib/flightHosted";
import { fieldMusicGain, getSoundSettings, masterGain, setSoundSettings, subscribeSoundSettings } from "@/lib/soundSettings";
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
// play (the embed or autoplay refused, no network, a blocker), in flight the
// music we host takes over without a word: The Sea, VL 317, played by Jean
// Dubé, dealt to the worlds by movement (lib/flightHosted.ts; CC BY 4.0, its
// credit stands in the mini-player for as long as it plays). At the desk
// nothing takes over: Čiurlionis's music is for the flight alone, it begins
// with the take-off and leaves with the landing, and nothing else ever starts
// on its own. When the field's stream cannot start by itself (Safari and
// every iPhone refuse a frame that plays with sound unasked; a blocker; no
// network) the mini-player says "Play field music": pressing it tries again
// inside that press and opens the player's own frame, whose play button
// always works (playFieldMusic below). Augustas's own Nocturne and
// Afterlight play only when they are picked in the flight's list, for that
// flight: the choice is forgotten on landing and never kept between visits,
// so neither can ever begin by itself.
//
// One thing plays at a time, across the whole site. In flight the music is the
// owner "flight" of the audio manager whether it is a stream or a file (the
// headphones and the OS's player fade out for it, the ambience ducks under it,
// and it stops when they start or when the room is left); at the desk it is
// background that nobody owns, and it leaves the moment anything else plays.
// Every change is a ramp: two decks cross over six seconds between worlds.
//
// The mini-player (scene/music/MusicDock.tsx). At the field it is only what is
// playing, a volume and a mute. In flight it opens into the picker as well:
// any of the above, kept for the visit.
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
  { id: "worlds", title: "In the Forest and The Sea, by world", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "worlds", flightOnly: true },
  { id: "miske", title: "In the Forest (Miške)", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "yt", video: VIDEO.miske, url: yt(VIDEO.miske) },
  { id: "jura", title: "The Sea (Jūra)", by: "Lithuanian National Symphony Orchestra, Modestas Pitrėnas", source: "YouTube · Ondine", kind: "yt", video: VIDEO.jura, url: yt(VIDEO.jura) },
  { id: "jura-live", title: "The Sea, live in Vilnius", by: "Lithuanian National Symphony Orchestra, Mirga Gražinytė-Tyla", source: "YouTube · Lithuanian National Philharmonic", kind: "yt", video: VIDEO.juraLive, url: yt(VIDEO.juraLive) },
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
  road: { video: VIDEO.miske, at: 0, part: "In the Forest: the forest wakes" },
  forest: { video: VIDEO.miske, at: 0, part: "In the Forest: the forest wakes" },
  sun: { video: VIDEO.jura, at: 2, part: "The Sea: the main theme" },
  stars: { video: VIDEO.jura, at: 410, gain: 0.9, part: "The Sea: the second theme" },
  rex: { video: VIDEO.jura, at: 1394, part: "The Sea: the inner recapitulation" },
  fairy: { video: VIDEO.jura, at: 1084, part: "The Sea: the recapitulation" },
  paradise: { video: VIDEO.miske, at: 288, gain: 0.92, part: "In the Forest: Andante espressivo e cantabile" },
  gate: { video: VIDEO.jura, at: 1236, gain: 0.9, part: "The Sea: the recapitulation, further in" },
  sea: { video: VIDEO.jura, at: 1799, gain: 0.8, part: "The Sea: the coda" },
  seafinale: { video: VIDEO.jura, at: 841, part: "The Sea: the storm" },
  funeral: { video: VIDEO.jura, at: 731, gain: 0.7, part: "The Sea: the development" },
  kings: { video: VIDEO.miske, at: 823, gain: 0.85, part: "In the Forest: the main theme returns" },
};

// How loud. A stream is levelled by its player's volume (0..1); a file by its voice in the graph. Both are
// multiplied by the visitor's volume (the slider), which is 1 at its middle mark.
// (The field's stream was at 0.12, which under the wind he took for silence: it is the sound of the field now,
// a clear background, a little under the flight's music. Its own slider is the "field music" level of
// lib/soundSettings.ts, shared with the OS's Settings; the master volume there leans every stream too, since a
// frame is outside the audio graph.)
const LEVEL = { deskStream: 0.32, flightStream: 0.34, deskFile: 0.28, flightFile: 0.7, flightSea: 0.72 };
// his own music: only ever by choice
const OWN: TrackId[] = ["nocturne", "afterlight"];
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
  retries: number; // times the field's stream was asked for again from inside a later gesture
  patient: boolean; // the visitor has asked for the field's music by hand: from now on its player waits for them, and never times out
  askedAt: number; // performance.now() when the field's stream was last asked for
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
  retries: 0,
  patient: false,
  askedAt: 0,
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
  // (at the field there is one music and nothing to choose; the picker is the flight's)
  const id = place === "desk" ? DEFAULT.desk : (st.choice[place] ?? DEFAULT[place]);
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
    // (in flight the hosted Čiurlionis stands in; at the field nothing does: his music is for the flight only)
    if (st.blocked) return place === "flight" ? { kind: "sea", key: `sea:${st.world}`, track: "sea-dube", level: 1 } : null;
    return { kind: "yt", key: `v:${t.video}`, video: t.video!, at: 0, level: stream, track: id };
  }
  if (t.kind === "sea") return place === "flight" ? { kind: "sea", key: `sea:${st.world}`, track: id, level: 1 } : { kind: "file", key: "f:sea", file: "/content/music/ciurlionis-jura-dube.mp3", level: file, track: id };
  return { kind: "file", key: `f:${id}`, file: t.file!, level: file, track: id };
}

const streamLevel = (n: Now & { kind: "yt" }) => Math.min(1, n.level * masterGain() * (st.place === "flight" ? gainOf() * st.flightVol : fieldMusicGain()));
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
    else hostedFlightVolume(st.flightVol * gainOf() * LEVEL.flightSea);
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
    // The deck that is not sounding takes it: the other one may still be on its way out (a world just left, or
    // the flight's music fading after a landing while the field's comes back), and is left to finish its fade.
    const ds = decks();
    const busy = (cur && cur.kind === "yt") || ds[st.live].vol > 0.02;
    const next = (busy ? 1 - st.live : st.live) as 0 | 1;
    st.live = next;
    const d = ds[next];
    d.fade(0, 0);
    // a stream left earlier is taken up where it was (a world's section within the same flight, the desk's for the visit)
    const at = st.pos[want.key] ?? want.at;
    const patient = st.place === "desk" && st.patient;
    st.askedAt = performance.now();
    d.play(want.video, at, patient);
    // (a patient player that has not started is offered again in the mini-player a moment later: see view)
    if (patient) window.setTimeout(emit, 3700);
    // (its level comes up when it is really playing: see onDeckState)
  } else if (want.kind === "file") {
    resumeAudio();
    voicePlayUrl(st.place === "flight" ? pickVoice() : bgVoice(), want.file, { fade: f, level: fileLevel(want) });
    externalMusic(null, false);
  } else {
    externalMusic(null, false);
    hostedFlightVolume(st.flightVol * gainOf() * LEVEL.flightSea);
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
  // the way home out of the kings' light is the landing: the music leaves with the flight, slowly
  if (key === "home") return musicFlightStop(8);
  st.place = "flight";
  st.world = key;
  note(`flight: ${key}`);
  apply();
}
export function musicFlightStop(fade = 5) {
  if (typeof window === "undefined" || st.place !== "flight") return;
  st.place = null;
  st.flightVol = 1;
  // (his own music was for that flight: the next one begins with Čiurlionis again unless it is picked again)
  if (st.choice.flight && OWN.includes(st.choice.flight)) {
    delete st.choice.flight;
    save();
  }
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
  else if (now.kind === "sea") hostedFlightVolume(v * gainOf() * LEVEL.flightSea);
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
  if (st.place !== "flight") return;
  const place = st.place;
  st.choice[place] = id;
  // choosing something is asking for sound, and a stream that failed earlier is given another chance
  st.muted = false;
  if (trackOf(id).kind === "yt" || trackOf(id).kind === "worlds") st.blocked = false;
  note(`picked ${id} for the ${place}`);
  save();
  apply(FADE.pick);
}
// The field's music, asked for by hand (the mini-player's "Play field music", pressed): tried again inside that
// press, and the player's own frame is opened out, where its play button works in every browser. From then on
// the field's player is patient: it waits for the visitor instead of giving up.
export function playFieldMusic() {
  if (typeof window === "undefined" || st.place === "flight") return;
  note("field music asked for by hand");
  st.blocked = false;
  st.patient = true;
  st.muted = false;
  st.open = true;
  save();
  const now = st.now;
  if (st.place === "desk" && now && now.kind === "yt") {
    // (already waiting on its deck: asked again, inside this press)
    st.askedAt = performance.now();
    decks()[st.live].play(now.video, st.pos[now.key] ?? now.at, true);
    window.setTimeout(emit, 3700);
    return emit();
  }
  st.place = "desk";
  apply(FADE.pick);
}
export function setMusicVolume(v: number) {
  // (at the field the slider is the field music's own level, the one Settings shows)
  if (st.place !== "flight") return setSoundSettings({ fieldMusic: v });
  st.volume = Math.min(1, Math.max(0, v));
  save();
  const now = st.now;
  if (now?.kind === "yt") decks()[st.live].fade(streamLevel(now), 0.15);
  else if (now?.kind === "file") voicePlayUrl(st.place === "flight" ? pickVoice() : bgVoice(), now.file, { fade: 0.15, level: fileLevel(now) });
  else if (now?.kind === "sea") hostedFlightVolume(st.flightVol * gainOf() * LEVEL.flightSea);
  emit();
}
export function setMusicMuted(m: boolean) {
  st.muted = m;
  // (asking for the field's music again is a press: a stream refused earlier is given another chance)
  if (!m && st.place !== "flight") st.blocked = false;
  save();
  note(m ? "muted" : "unmuted");
  apply(m ? 0.6 : FADE.pick);
}
export function setMusicOpen(open: boolean) {
  st.open = open;
  emit();
}

// `tap`: the field's music could not start by itself and waits for a press ("Play field music")
export type MusicView = { place: Place | null; choice: TrackId; playing: Track | null; part: string | null; kind: Now["kind"] | null; state: string; volume: number; muted: boolean; open: boolean; fallback: boolean; tap: boolean; credit: string | null; v: number };
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
    choice: place === "flight" ? (st.choice.flight ?? DEFAULT.flight) : DEFAULT.desk,
    playing,
    part: now?.kind === "yt" ? (now.part ?? null) : null,
    kind: now?.kind ?? null,
    state: d ? d.state : now ? "playing" : "idle",
    volume: place === "flight" ? st.volume : getSoundSettings().fieldMusic,
    muted: st.muted,
    open: st.open,
    fallback: st.blocked,
    tap: place === "desk" && !silent() && (d ? st.patient && d.state !== "playing" && performance.now() - st.askedAt > 3500 : st.blocked),
    credit: now?.kind === "sea" ? FLIGHT_CREDIT : (playing?.credit ?? null),
    v: st.v,
  };
  return snap;
}
const SERVER: MusicView = { place: null, choice: "spring", playing: null, part: null, kind: null, state: "idle", volume: 0.7, muted: false, open: false, fallback: false, tap: false, credit: null, v: 0 };
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
        // (only a choice among Čiurlionis's recordings is kept, and only for the flight: his own music, or anything
        // an older build kept for the desk, is never found waiting to start by itself)
        const f = k.choice?.flight;
        st.choice = f && TRACKS.some((t) => t.id === f) && !OWN.includes(f) ? { flight: f } : {};
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
    // (inside a gesture: the hosted stand-in may start later without one)
    voicePrime(bgVoice());
    // The scene may be let in by the loader's own clock, before the visitor has touched anything: the field's
    // stream is then asked for with no gesture behind it and a browser refuses it. The next touches of the scene
    // (the ambience calls this from every one) ask again from inside the gesture, twice at most; after that it
    // is left to the "Play field music" pill.
    if (st.blocked && st.place === "desk" && !st.now && st.retries < 2 && performance.now() - st.askedAt > 2500) {
      st.retries++;
      st.blocked = false;
      note(`field music asked again inside a gesture (${st.retries})`);
      apply(FADE.desk);
    }
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
    onMuteChange(() => {
      // (the pill pressed for sound is a press: the field's stream, refused earlier, may be tried again)
      if (!sceneMuted() && st.place !== "flight") st.blocked = false;
      apply(0.4);
    }),
    // the visitor's levels (the mini-player's slider, the OS's Settings): what is playing leans to them
    subscribeSoundSettings(() => {
      const now = st.now;
      if (now?.kind === "yt") decks()[st.live].fade(streamLevel(now), 0.15);
      emit();
    }),
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
      patient: st.patient,
      tap: view().tap,
      sound: getSoundSettings(),
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
        playField: playFieldMusic,
        sound: setSoundSettings,
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
