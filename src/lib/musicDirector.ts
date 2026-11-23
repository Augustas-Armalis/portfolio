import { useSyncExternalStore } from "react";
import { audioHushed, externalMusic, onMusicClaim, onMuteChange, onOwnerStop, sceneMuted, setDeskMusic } from "@/lib/audio";
import { FLIGHT_CREDIT, hostedFlightActive, hostedFlightPrime, hostedFlightStop, hostedFlightTo, hostedFlightVolume } from "@/lib/flightHosted";
import { fieldMusicGain, getSoundSettings, masterGain, setSoundSettings, subscribeSoundSettings } from "@/lib/soundSettings";
import { makeDeck, type Deck } from "@/lib/stream";

// The music of the 3D world. Three pieces, each where it belongs, and nothing to choose:
//
//   field   "Village in a Mountain Pass – Ambience and Music"   at home: the desk, and the field round it in the air
//           (Martia's Muses), looping                          too. Asked for by the ambience (lib/ambience.ts)
//                                                              once the visitor has clicked.
//   miske   Čiurlionis, Miške (In the Forest), looping          the hidden forest and the cave (home world), and the
//                                                              voyage from there up to The Offering (gate)
//   jura    Čiurlionis, Jūra (The Sea), looping                 Sonata of the Sea: Finale (seafinale) to the end:
//                                                              sea, funeral, kings
//
// A piece is never restarted while the plane stays in its range: going from world to world inside it (in any
// order, by the gates or by the Worlds list) changes nothing. Crossing between ranges is a slow cross-fade
// between the two decks, and each piece is taken up where it was left (kept for the visit). In the home world the
// field's music carries on through the take-off; flying into the forest or near the cave (Room tells us how far
// in, musicForest), it hands over to Miške, and back again on the way out. Landing hands back to the field.
//
// All three are played through the embedded YouTube player (lib/stream.ts): never downloaded, never rehosted.
// When a Čiurlionis stream cannot play (the embed or autoplay refused, no network, a blocker), the music we host
// stands in without a word: The Sea, VL 317, played by Jean Dubé (lib/flightHosted.ts, CC BY 4.0, its credit in
// the mini-player for as long as it plays). The field has no stand-in: a refused field stream is silence, and the
// mini-player says "Play field music" (Safari and every iPhone refuse a frame that plays with sound unasked):
// pressing it tries again inside that press and opens the player's own frame, whose play button always works.
//
// His own songs are never played here: they are in the OS's Records and on the desk's headphones, by his choice.
//
// One thing plays at a time, across the whole site. In flight the music is the owner "flight" of the audio
// manager (the headphones and the OS's player fade out for it, the ambience ducks under it, and it stops when
// they start or when the room is left); at the desk it is background that nobody owns, and it leaves the moment
// anything else plays.
//
// The mini-player (scene/music/MusicDock.tsx) is only what is playing, its credit, a volume and a mute. The
// volume is the shared "music" level of lib/soundSettings.ts (the OS's Settings shows the same one), under the
// master volume; the mute is the music's own, and the system's Sound switch silences it with everything else.
//
// Development: window.__music.report() (states, volumes, what was asked for and why), .forest(k) to rehearse
// the forest's edge, .fail() to rehearse a refused stream, .mute(on), .volume(v).

export type PieceId = "field" | "miske" | "jura";
export type TrackId = PieceId | "sea-dube";
export type Place = "desk" | "flight";
export type Track = {
  id: TrackId;
  title: string;
  by: string; // whose it is
  source: string; // where it comes from, as shown
  video?: string;
  credit?: string; // a licence that asks to be named
  url?: string; // where the upload lives
};

// The uploads (each checked public and embeddable through YouTube's oEmbed):
//   QBOIlkb67Fs  "Village in a Mountain Pass Ambience and Music", on its maker's own channel (Martia's Muses)
//   MzEH7xrmflg  "M. K. Čiurlionis - Miške (In The Forest)", channel "tamsta"
//   BY4o2G6hmaQ  "M. K. Čiurlionis - Jūra (The Sea)", channel "tamsta"
const VIDEO: Record<PieceId, string> = { field: "QBOIlkb67Fs", miske: "MzEH7xrmflg", jura: "BY4o2G6hmaQ" };
const yt = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const TRACKS: Record<TrackId, Track> = {
  field: { id: "field", title: "Village in a Mountain Pass", by: "Martia's Muses", source: "YouTube · Martia's Muses", video: VIDEO.field, url: yt(VIDEO.field) },
  miske: { id: "miske", title: "Miške (In the Forest)", by: "M. K. Čiurlionis", source: "YouTube · tamsta", video: VIDEO.miske, url: yt(VIDEO.miske) },
  jura: { id: "jura", title: "Jūra (The Sea)", by: "M. K. Čiurlionis", source: "YouTube · tamsta", video: VIDEO.jura, url: yt(VIDEO.jura) },
  "sea-dube": { id: "sea-dube", title: "The Sea, VL 317", by: "M. K. Čiurlionis · Jean Dubé, piano", source: "Hosted here", credit: FLIGHT_CREDIT },
};

// The voyage in two halves (worlds/voyage.ts `music` keys). Everything else in the air is Miške, except the home
// world ("road", at take-off and whenever the plane is back in it), which is the field's unless the plane is in
// the forest, and "home", the way back out of the kings' light, which is the landing.
const SEA_RANGE = new Set(["seafinale", "sea", "funeral", "kings"]);
// (when a Čiurlionis stream is refused, the hosted Sea stands in: one movement for each half, each carrying on
// across its half as the stream would)
const HOSTED: Record<"miske" | "jura", string> = { miske: "road", jura: "kings" };

// How loud. A stream is levelled by its player's volume (0..1), times the visitor's music level (1 at the slider's
// middle mark) and the master volume (a frame is outside the audio graph). The field sits a little under the flight.
const LEVEL: Record<PieceId, number> = { field: 0.32, miske: 0.34, jura: 0.34 };
const HOSTED_LEVEL = 0.72;
// seconds: every hand-over is slow (field to forest and back, the two halves of the voyage, the landing)
const FADE = { change: 7, desk: 4, out: 2.5, press: 1.6 };
// the forest's edge, with room between going in and coming out so it never flickers (Room: inJourneyForest)
const FOREST_IN = 0.55;
const FOREST_OUT = 0.25;
const STORE = "ag-music";

type Now = { kind: "yt"; key: string; video: string; level: number; track: PieceId } | { kind: "sea"; key: string; track: "sea-dube"; hosted: string };

type S = {
  place: Place | null;
  world: string; // the flight's world key
  forest: boolean; // in the home world, the plane is in the forest or by the cave
  deskWant: boolean; // the ambience would have the field's music at the desk now
  muted: boolean;
  flightVol: number; // the flight's own quieting (the kings' wood)
  now: Now | null;
  live: 0 | 1; // which deck has the stream
  decks: [Deck, Deck] | null;
  blocked: boolean; // the field's stream has failed (silence, and the "Play field music" pill)
  flightBlocked: boolean; // a Čiurlionis stream has failed on this page: the hosted music stands in
  retries: number; // times the field's stream was asked for again from inside a later gesture
  patient: boolean; // the visitor has asked for the field's music by hand: from now on its player waits for them, and never times out
  askedAt: number; // performance.now() when the field's stream was last asked for
  lastFail: string | null;
  pos: Record<string, number>; // where each piece was left
  hidden: boolean;
  log: string[];
  tick: number;
  open: boolean; // the mini-player is opened out
  v: number; // bumped on every change, for React
  leaving: number; // (the hosted engine lets go through stopOwner, which we also listen to: not while we are the ones stopping it)
  off: (() => void)[]; // what this module listens to, so a reloaded copy can take over cleanly
};
const G = globalThis as typeof globalThis & { __aosMusic2?: S };
const st: S = (G.__aosMusic2 ??= {
  place: null,
  world: "road",
  forest: false,
  deskWant: false,
  muted: false,
  flightVol: 1,
  now: null,
  live: 0,
  decks: null,
  blocked: false,
  flightBlocked: false,
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

function save() {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify({ muted: st.muted }));
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
// the mini-player: where the frames are seen and what is playing is named
let docked = false;
function dock() {
  if (docked) return;
  docked = true;
  void import("@/components/scene/music/MusicDock").then((m) => m.mountMusicDock()).catch(() => (docked = false));
}

// ---- what should be heard now ----
const silent = () => st.muted || sceneMuted() || st.hidden;
export function pieceOf(place: Place, world: string, forest: boolean): PieceId {
  if (place === "desk" || world === "home") return "field";
  if (world === "road") return forest ? "miske" : "field";
  return SEA_RANGE.has(world) ? "jura" : "miske";
}
function resolve(): Now | null {
  if (!st.place) return null;
  const id = pieceOf(st.place, st.world, st.forest);
  if (id === "field") return st.blocked ? null : { kind: "yt", key: "v:field", video: VIDEO.field, level: LEVEL.field, track: "field" };
  if (st.flightBlocked) return { kind: "sea", key: `sea:${id}`, track: "sea-dube", hosted: HOSTED[id] };
  return { kind: "yt", key: `v:${id}`, video: VIDEO[id], level: LEVEL[id], track: id };
}

const streamLevel = (n: Now & { kind: "yt" }) => Math.min(1, n.level * masterGain() * fieldMusicGain() * (st.place === "flight" ? st.flightVol : 1));
const hostedLevel = () => st.flightVol * fieldMusicGain() * HOSTED_LEVEL;

function leave(now: Now, fade: number) {
  st.leaving++;
  try {
    if (now.kind === "yt") {
      const d = decks()[st.live];
      if (d.videoId) st.pos[now.key] = d.time();
      d.stop(fade);
    } else hostedFlightStop(Math.max(fade, 1.2));
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
  const f = fade ?? FADE.change;
  if (cur && cur.key === want.key) {
    // the same piece carries on: only its level leans
    st.now = want;
    if (want.kind === "yt") {
      const d = decks()[st.live];
      d.fade(streamLevel(want), 1.2);
      // (the field's music going up with the plane becomes the flight's, and back at the desk nobody's)
      if (d.state === "playing") owned();
    } else hostedFlightVolume(hostedLevel());
    return emit();
  }
  // the hosted stand-in moves between its own movements by itself
  if (cur && cur.kind === "sea" && want.kind === "sea") {
    st.now = want;
    note(`hosted: ${want.key}`);
    hostedFlightTo(want.hosted);
    return emit();
  }
  if (cur) leave(cur, f);
  st.now = want;
  note(`in: ${want.key}${want.kind === "yt" ? ` @${Math.round(st.pos[want.key] ?? 0)}s` : ""}`);
  if (want.kind === "yt") {
    const ds = decks();
    // A deck that still holds this recording (left a moment ago and still fading, or paused where it was) takes
    // it back up; otherwise the deck that is not sounding takes it, and the other is left to finish its fade.
    const held = ds.findIndex((d, i) => d.videoId === want.video && d.state !== "failed" && d.state !== "idle" && !(cur?.kind === "yt" && i === st.live));
    const busy = (cur && cur.kind === "yt") || ds[st.live].vol > 0.02;
    const next = (held >= 0 ? held : busy ? 1 - st.live : st.live) as 0 | 1;
    st.live = next;
    const d = ds[next];
    // (still sounding on its way out: it turns round from where it is, no dip and no seek)
    const sounding = held === next && (d.state === "playing" || d.state === "buffering") && d.vol > 0.001;
    if (!sounding) d.fade(0, 0);
    const at = sounding ? d.time() : (st.pos[want.key] ?? 0);
    const patient = st.place === "desk" && st.patient;
    st.askedAt = performance.now();
    d.play(want.video, at, patient);
    if (sounding) {
      d.fade(streamLevel(want), f);
      owned();
    }
    // (a patient player that has not started is offered again in the mini-player a moment later: see view)
    if (patient) window.setTimeout(emit, 3700);
    // (otherwise its level comes up when it is really playing: see onDeckState)
  } else {
    externalMusic(null, false);
    hostedFlightVolume(hostedLevel());
    hostedFlightTo(want.hosted);
  }
  watching(true);
  emit();
}

// in flight the stream is the music's owner, as a voice would be; at the desk it is background nobody owns
const owned = () => externalMusic(st.place === "flight" ? "flight" : null, st.place === "flight");

function onDeckState(d: Deck) {
  const ds = decks();
  const now = st.now;
  const mine = now && now.kind === "yt" && ds[st.live] === d;
  if (mine && d.state === "playing") {
    if (d.to < 0.001 || d.vol < 0.001) d.fade(streamLevel(now), st.place === "desk" ? FADE.desk : FADE.change);
    owned();
  } else if (mine && d.state === "ended") {
    // every piece loops: a recording that runs out begins again
    d.play(now.video, 0);
  }
  emit();
}
function onDeckFail(d: Deck, why: string) {
  note(`stream failed on deck ${d.name}: ${why}`);
  st.lastFail = why;
  const now = st.now;
  if (!now || now.kind !== "yt" || decks()[st.live] !== d) return emit();
  d.stop(0.4);
  // the field's goes quiet (and the pill offers it); a Čiurlionis stream gives way to the hosted Sea for this page
  if (now.track === "field") st.blocked = true;
  else st.flightBlocked = true;
  st.now = null;
  externalMusic(null, false);
  apply(FADE.press);
}

// While something plays: remember where it is, and loop it a breath before its end.
function watching(on: boolean) {
  window.clearInterval(st.tick);
  st.tick = 0;
  if (!on) return;
  st.tick = window.setInterval(() => {
    const now = st.now;
    if (!now || now.kind !== "yt") return;
    const d = decks()[st.live];
    if (d.state !== "playing") return;
    st.pos[now.key] = d.time();
    const dur = d.duration();
    // (the end itself is caught by "ended")
    if (dur > 30 && d.time() > dur - 1.5) d.seek(0);
  }, 1000);
}

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
  const now = st.now;
  if (st.place !== "flight" || !now) return;
  if (now.kind === "yt") decks()[st.live].fade(streamLevel(now), 0.6);
  else hostedFlightVolume(hostedLevel());
}
// (inside a tap that will lead to a flight: the hosted decks are woken so they may start later without one)
export function musicPrime() {
  if (typeof window === "undefined") return;
  hostedFlightPrime();
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
    decks()[st.live].play(now.video, st.pos[now.key] ?? 0, true);
    window.setTimeout(emit, 3700);
    return emit();
  }
  st.place = "desk";
  apply(FADE.press);
}
// the music's level: the shared one (lib/soundSettings.ts), for the field and the flight alike
export function setMusicVolume(v: number) {
  setSoundSettings({ fieldMusic: v });
}
export function setMusicMuted(m: boolean) {
  st.muted = m;
  // (asking for the music again is a press: a stream refused earlier is given another chance)
  if (!m) {
    st.blocked = false;
    st.flightBlocked = false;
  }
  save();
  note(m ? "muted" : "unmuted");
  apply(m ? 0.6 : FADE.press);
}
export function setMusicOpen(open: boolean) {
  st.open = open;
  emit();
}

// `tap`: the field's music could not start by itself and waits for a press ("Play field music")
export type MusicView = { place: Place | null; playing: Track | null; kind: Now["kind"] | null; state: string; volume: number; muted: boolean; open: boolean; fallback: boolean; tap: boolean; credit: string | null; v: number };
let snap: MusicView | null = null;
let snapV = -1;
function view(): MusicView {
  if (snap && snapV === st.v) return snap;
  snapV = st.v;
  const now = st.now;
  const place = st.place;
  const playing = now ? TRACKS[now.track] : null;
  const d = now?.kind === "yt" && st.decks ? st.decks[st.live] : null;
  snap = {
    place,
    playing,
    kind: now?.kind ?? null,
    state: d ? d.state : now ? "playing" : "idle",
    volume: getSoundSettings().fieldMusic,
    muted: st.muted,
    open: st.open,
    fallback: now?.kind === "sea",
    tap: place === "desk" && !silent() && (d ? st.patient && d.state !== "playing" && performance.now() - st.askedAt > 3500 : st.blocked),
    credit: playing?.credit ?? null,
    v: st.v,
  };
  return snap;
}
const SERVER: MusicView = { place: null, playing: null, kind: null, state: "idle", volume: 0.7, muted: false, open: false, fallback: false, tap: false, credit: null, v: 0 };
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
      // (only the mute is kept, for the visit: there is nothing to choose)
      const k = JSON.parse(window.sessionStorage.getItem(STORE) ?? "null") as { muted?: boolean } | null;
      if (k) st.muted = !!k.muted;
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
      if (owner === "flight" && st.place === "flight" && !st.leaving) musicFlightStop(fade, false);
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
      else if (now?.kind === "sea") hostedFlightVolume(hostedLevel());
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
      forest: st.forest,
      deskWant: st.deskWant,
      piece: st.place ? pieceOf(st.place, st.world, st.forest) : null,
      now: st.now,
      silent: silent(),
      muted: st.muted,
      sceneMuted: sceneMuted(),
      hushed: audioHushed(),
      flightVol: st.flightVol,
      blocked: st.blocked,
      flightBlocked: st.flightBlocked,
      patient: st.patient,
      tap: view().tap,
      sound: getSoundSettings(),
      lastFail: st.lastFail,
      live: st.live,
      decks: st.decks?.map((d) => d.report()) ?? [],
      hostedFlight: hostedFlightActive(),
      pos: Object.fromEntries(Object.entries(st.pos).map(([k, v]) => [k, Math.round(v)])),
      log: st.log.slice(-14),
    });
    Object.assign(window, {
      __music: {
        report,
        state: st,
        forest: musicForest,
        volume: setMusicVolume,
        mute: setMusicMuted,
        playField: playFieldMusic,
        sound: setSoundSettings,
        tracks: TRACKS,
        // rehearse a refused stream: in flight the hosted music must take over, at the field silence and the pill
        fail: () => st.decks && onDeckFail(st.decks[st.live], "rehearsed failure"),
        unblock: () => {
          st.blocked = false;
          st.flightBlocked = false;
          apply();
        },
      },
    });
  }
}
