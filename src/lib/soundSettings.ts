import { useSyncExternalStore } from "react";
import { useOS } from "@/store";

// The visitor's own sound levels, for anything that wants to show them (the OS's Settings app, the field's
// mini-player): one small store, kept in localStorage.
//
//   master      0..1   everything: 1 is the site as it was mixed, 0 is silence            (default 1)
//   fieldMusic  0..1   the scene's music (field.mp3, forest.mp3, sea.mp3, at the desk    (default 0.7)
//                      and in flight): 0.7 is the level it was set at, 1 a little louder (+3 dB), 0 none
//   ambience    0..1   the air of the place (wind, waves, far birds), at the desk and in   (default 0.7)
//                      every world: 0.7 as mixed, 1 a little louder (+3 dB), 0 none
//   muted       bool   all sound off. This IS the system's Sound switch (useOS().sound, shown in Control Centre
//                      and Settings), read and written through here so there is one truth.
//
//   getSoundSettings()            the four values now
//   setSoundSettings({ ... })     change any of them (clamped, kept, everyone told)
//   subscribeSoundSettings(fn)    told on every change; returns the function that stops it
//   useSoundSettings()            the same, as a React hook
//   SOUND_DEFAULTS                what "reset" means
//
// Who listens: lib/audio.ts (master, on the last gain before the speakers), lib/musicDirector.ts (master and
// fieldMusic, on the level of its voices), lib/ambience.ts (ambience).

export type SoundSettings = { master: number; fieldMusic: number; ambience: number; muted: boolean };
export const SOUND_DEFAULTS: SoundSettings = { master: 1, fieldMusic: 0.7, ambience: 0.7, muted: false };

const KEY = "ag-sound";
type Kept = { master: number; fieldMusic: number; ambience: number };
type Store = { kept: Kept; subs: Set<() => void>; snap: SoundSettings | null; wired: boolean };
const G = globalThis as typeof globalThis & { __aosSound?: Store };

const clamp01 = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

function store(): Store {
  if (G.__aosSound) return G.__aosSound;
  const kept: Kept = { master: SOUND_DEFAULTS.master, fieldMusic: SOUND_DEFAULTS.fieldMusic, ambience: SOUND_DEFAULTS.ambience };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    const p = raw ? (JSON.parse(raw) as Partial<Kept>) : null;
    if (p && typeof p === "object") {
      kept.master = clamp01(p.master, kept.master);
      kept.fieldMusic = clamp01(p.fieldMusic, kept.fieldMusic);
      kept.ambience = clamp01(p.ambience, kept.ambience);
    }
  } catch {
    /* storage blocked or stale: the defaults */
  }
  return (G.__aosSound = { kept, subs: new Set(), snap: null, wired: false });
}
const systemMuted = () => {
  try {
    return !useOS.getState().sound;
  } catch {
    return false;
  }
};
function tell() {
  const s = store();
  s.snap = null;
  s.subs.forEach((f) => f());
}
// (the system's Sound switch may be thrown from anywhere: whoever listens here hears of it too)
function wire() {
  const s = store();
  if (s.wired || typeof window === "undefined") return;
  s.wired = true;
  useOS.subscribe((a, b) => {
    if (a.sound !== b.sound) tell();
  });
}

export function getSoundSettings(): SoundSettings {
  const s = store();
  return (s.snap ??= { ...s.kept, muted: systemMuted() });
}
export function setSoundSettings(patch: Partial<SoundSettings>) {
  const s = store();
  wire();
  const k = s.kept;
  const next: Kept = { master: clamp01(patch.master, k.master), fieldMusic: clamp01(patch.fieldMusic, k.fieldMusic), ambience: clamp01(patch.ambience, k.ambience) };
  const changed = next.master !== k.master || next.fieldMusic !== k.fieldMusic || next.ambience !== k.ambience;
  s.kept = next;
  if (changed) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* not kept */
    }
  }
  const mute = typeof patch.muted === "boolean" && patch.muted !== systemMuted();
  // (the switch tells everyone itself, through the subscription above)
  if (mute) useOS.getState().setSound(!patch.muted);
  else if (changed) tell();
}
export function subscribeSoundSettings(fn: () => void) {
  const s = store();
  wire();
  s.subs.add(fn);
  return () => {
    s.subs.delete(fn);
  };
}
export const useSoundSettings = () => useSyncExternalStore(subscribeSoundSettings, getSoundSettings, () => SOUND_DEFAULTS);

// How much each slider multiplies its sound by (0.7 is "as mixed").
export const fieldMusicGain = () => getSoundSettings().fieldMusic / 0.7;
export const ambienceGain = () => getSoundSettings().ambience / 0.7;
export const masterGain = () => getSoundSettings().master;
