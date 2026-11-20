import { channel, musicOwner, resumeAudio, stopOwner, voice, voicePlay, voiceStop, type Voice } from "@/lib/audio";

// Music for the flight: one recording per world, cross-faded as the plane
// passes from one painting's world into the next ("road" is the stretch
// between worlds).
//
//   flightMusicTo(id)   cross-fade to that world's recording (equal power,
//                       5 s). Asking for the recording that is already
//                       playing does nothing: it is never restarted. Coming
//                       back to a recording heard earlier in the same flight
//                       carries on from where it was left.
//   flightMusicStop()   fade out (5 s), pause and let go of the files.
//
// No recordings of Čiurlionis's own music are in the project yet, so the
// table points at the two pieces that exist (both by Augustas). To give a
// world its own piece, drop the file in /public/content/music/ and change its
// entry here: nothing else needs to know. A file is only fetched the first
// time its world is reached.
//
// The two decks are voices of the audio manager (lib/audio.ts), owner
// "flight" on the "flight" channel: taking off fades the headphones out,
// and the sky hears the flight through the shared analyser.

const NOCTURNE = "/content/music/nocturne-for-absent-things.mp3";
const AFTERLIGHT = "/content/music/afterlight.m4a";

export type FlightTrack = { file: string; title: string; start?: number; gain?: number };
// The two pieces are dealt out by mood: the Nocturne to the night and the dusk
// (the road, the stars, Rex, the gate, the kings' wood), Afterlight to the
// worlds of daylight (the sun, the castle, Paradise, the sea), so that most
// passages between worlds are a change of music and none is abrupt.
export const FLIGHT_TRACKS: Record<string, FlightTrack> = {
  road: { file: NOCTURNE, title: "Nocturne for Absent Things" },
  forest: { file: NOCTURNE, title: "Nocturne for Absent Things" }, // e.g. "Miške" (In the Forest), symphonic poem
  sun: { file: AFTERLIGHT, title: "Afterlight" },
  stars: { file: NOCTURNE, title: "Nocturne for Absent Things" },
  rex: { file: NOCTURNE, title: "Nocturne for Absent Things", gain: 0.9 },
  fairy: { file: AFTERLIGHT, title: "Afterlight" },
  paradise: { file: AFTERLIGHT, title: "Afterlight", gain: 0.9 },
  kings: { file: NOCTURNE, title: "Nocturne for Absent Things", gain: 0.8 },
  sea: { file: AFTERLIGHT, title: "Afterlight", gain: 0.85 }, // e.g. "Jūra" (The Sea), symphonic poem
};

const FADE = 5; // seconds: long, so one piece leaves under the cloud while the next arrives with the new sky

// Which recording each deck holds. Kept on globalThis with the decks
// themselves, so a hot reload carries on instead of starting a second copy.
type Flight = { live: 0 | 1; file: (string | null)[]; key: string | null; pos: Record<string, number>; pending: number; primed: boolean };
const S: Flight = ((globalThis as typeof globalThis & { __aosFlight?: Flight }).__aosFlight ??= {
  live: 0,
  file: [null, null],
  key: null,
  pos: {},
  pending: 0,
  primed: false,
});

function decks(): [Voice, Voice] | null {
  const o = { channel: "flight", owner: "flight", scene: true, loop: true } as const;
  const a = voice("flight-a", o);
  const b = voice("flight-b", o);
  return a && b ? [a, b] : null;
}

// Safari only lets an element start without a gesture if that element has
// played during one. Take-off is a gesture: each deck plays a moment of
// silence then, so later worlds may start their recordings on their own.
let silence = "";
function prime(v: Voice) {
  if (!silence) {
    const n = 800;
    const b = new DataView(new ArrayBuffer(44 + n));
    const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF");
    b.setUint32(4, 36 + n, true);
    str(8, "WAVEfmt ");
    b.setUint32(16, 16, true);
    b.setUint16(20, 1, true);
    b.setUint16(22, 1, true);
    b.setUint32(24, 8000, true);
    b.setUint32(28, 8000, true);
    b.setUint16(32, 1, true);
    b.setUint16(34, 8, true);
    str(36, "data");
    b.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
    silence = URL.createObjectURL(new Blob([b.buffer], { type: "audio/wav" }));
  }
  v.el.src = silence;
  void v.el
    .play()
    .then(() => v.el.src.startsWith("blob:") && v.el.pause())
    .catch(() => {});
}

function load(v: Voice, idx: number, track: FlightTrack) {
  const at = S.pos[track.file] ?? track.start ?? 0;
  v.el.src = track.file;
  if (at > 0)
    v.el.addEventListener(
      "loadedmetadata",
      () => {
        if (S.file[idx] === track.file && Number.isFinite(v.el.duration)) v.el.currentTime = at % v.el.duration;
      },
      { once: true },
    );
  voicePlay(v, { fade: FADE, level: track.gain ?? 1 });
}

// Called from a tap that will lead to a flight a moment later (the phone's Fly shortcut): the output is woken and
// both decks play their moment of silence inside the tap, so the music may start on its own when the plane leaves.
export function flightMusicPrime() {
  if (typeof window === "undefined") return;
  resumeAudio();
  const d = decks();
  if (!d) return;
  S.primed = true;
  d.forEach((v) => v.el.paused && !v.want && (!v.el.getAttribute("src") || v.el.src.startsWith("blob:")) && prime(v));
}

// Cross-fade to the recording of a world (a station id, "road" or "sea").
export function flightMusicTo(key: string) {
  if (typeof window === "undefined") return;
  const track = FLIGHT_TRACKS[key] ?? FLIGHT_TRACKS.road;
  const d = decks();
  if (!d) return;
  const cur = d[S.live];
  const other = d[1 - S.live];
  const next = (1 - S.live) as 0 | 1;
  S.key = key;
  // (take-off is a tap: the output is woken inside it, before anything is asked to play)
  resumeAudio();
  if (!S.primed) {
    S.primed = true;
    prime(cur);
  }
  if (S.file[S.live] === track.file && (cur.want || S.pending)) {
    // the same recording carries on under a new name: no restart, no dip
    if (cur.want) voicePlay(cur, { fade: FADE, level: track.gain ?? 1 });
    return;
  }
  window.clearTimeout(S.pending);
  S.pending = 0;
  if (cur.want) {
    const f = S.file[S.live];
    if (f) S.pos[f] = cur.el.currentTime;
    voiceStop(cur, FADE);
  }
  S.live = next;
  if (S.file[next] === track.file && !other.el.paused) {
    // we only just left this recording and it is still fading: turn it around
    voicePlay(other, { fade: FADE, level: track.gain ?? 1 });
    return;
  }
  S.file[next] = track.file;
  const later = (ms: number) => {
    S.pending = window.setTimeout(() => {
      S.pending = 0;
      load(other, next, track);
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
    // (the deck that will play is given its moment of silence now, inside the tap, so that it may start on its
    // own in a moment: a phone refuses a first play() that comes from a timer)
    if (other.el.paused && !other.el.getAttribute("src")) prime(other);
    stopOwner(owner, 0.7);
    later(600);
  } else load(other, next, track);
}

// Fade everything out, pause, release (landing).
export function flightMusicStop() {
  if (typeof window === "undefined") return;
  // nothing was started: nothing to stop (and no reason to make the decks)
  if (!S.file[0] && !S.file[1] && !S.pending) return;
  window.clearTimeout(S.pending);
  S.pending = 0;
  S.file = [null, null];
  S.key = null;
  S.pos = {};
  stopOwner("flight", FADE, true);
}

export function flightMusicVolume(v: number) {
  if (typeof window === "undefined") return;
  const g = channel("flight");
  g.gain.setTargetAtTime(v, g.context.currentTime, 0.2);
}

// Development: window.__flight = { to, stop, state, tracks } for driving the
// cross-fades from the console.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  Object.assign(window, { __flight: { to: flightMusicTo, stop: flightMusicStop, state: S, tracks: FLIGHT_TRACKS } });
}
