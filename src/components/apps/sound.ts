"use client";

// Sound, as System Settings sees it: every level the visitor can set, read and written through this one file.
// THE WHOLE WIRING LIVES HERE. When src/lib grows its own typed get / set / subscribe for these levels, swap the
// bodies below for calls to it; the Sound pane (system.tsx) only knows the shape `useSound()` returns.
//
// Where each level lives today:
//   output        the five channel gains of the audio graph (lib/audio.ts `channel()`), scaled together. They are
//                 plain summing nodes the manager never ramps itself, so a fader on them fights nothing. A stream
//                 that plays in a frame of its own (the field's YouTube decks) is outside the graph: it follows
//                 Mute and its own Music level, not this fader. That is the gap the lib API should close.
//   mute          the OS Sound setting (store `sound`): it silences everything, as before.
//   field sounds  the world's mute pill (lib/audio.ts setSceneMuted / sceneMuted / onMuteChange).
//   field music   the music director (lib/musicDirector.ts setMusicVolume / setMusicMuted, read with useMusic).
//   ambience      the "ambience" channel gain, times the output level.
//   Music app     the Records player's own volume (apps/player.tsx).
// Output and ambience are remembered here (localStorage "aos-levels"); the others are remembered where they live.

import { useSyncExternalStore } from "react";
import { channel, fadeParam, onMuteChange, sceneMuted, setSceneMuted, type Channel } from "@/lib/audio";
import { setMusicMuted, setMusicVolume, useMusic } from "@/lib/musicDirector";
import { useOS } from "@/store";
import { player, usePlayer } from "./player";

type Levels = { output: number; ambience: number };
const KEY = "aos-levels";
const FULL: Levels = { output: 1, ambience: 1 };
const CHANNELS: Channel[] = ["music", "flight", "ambience", "piano", "sfx"];
const unit = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

let levels: Levels = FULL;
let loaded = false;
const subs = new Set<() => void>();

// the faders themselves: every channel at the output level, the ambience at its own share of it
function apply(seconds = 0.12) {
  try {
    for (const c of CHANNELS) fadeParam(channel(c).gain, levels.output * (c === "ambience" ? levels.ambience : 1), seconds);
  } catch {
    /* no audio graph in this browser: the levels are still remembered */
  }
}
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const j = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Levels> | null;
    if (j) levels = { output: unit(j.output, 1), ambience: unit(j.ambience, 1) };
  } catch {
    /* ignore */
  }
  // remembered levels are put back on the first touch or key of the visit: an audio context made before the
  // visitor has done anything is held suspended by the browser, and nothing can sound before that anyway
  if (levels.output !== 1 || levels.ambience !== 1) {
    const once = () => {
      window.removeEventListener("pointerdown", once, true);
      window.removeEventListener("keydown", once, true);
      apply(0);
    };
    window.addEventListener("pointerdown", once, true);
    window.addEventListener("keydown", once, true);
  }
}
function set(next: Partial<Levels>) {
  levels = { output: unit(next.output ?? levels.output, 1), ambience: unit(next.ambience ?? levels.ambience, 1) };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(levels));
  } catch {
    /* ignore */
  }
  apply();
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

// This file arrives with Settings' own chunk, which the shell warms once it is idle: the remembered levels are
// put back then, whether or not Settings is ever opened.
if (typeof window !== "undefined") load();

export type Sound = {
  /** everything the site plays, 0 to 1, and whether it is muted */
  output: number;
  muted: boolean;
  setOutput: (v: number) => void;
  setMuted: (m: boolean) => void;
  /** the 3D world's own sounds (its mute pill) */
  field: boolean;
  setField: (on: boolean) => void;
  /** the music at the desk and in flight */
  music: number;
  musicMuted: boolean;
  setMusic: (v: number) => void;
  setMusicMuted: (m: boolean) => void;
  /** wind, birds and water */
  ambience: number;
  setAmbience: (v: number) => void;
  /** the Music app (Records) */
  player: number;
  setPlayer: (v: number) => void;
};

export function useSound(): Sound {
  load();
  const own = useSyncExternalStore(subscribe, () => levels, () => FULL);
  const on = useOS((s) => s.sound);
  const fieldMuted = useSyncExternalStore(onMuteChange, sceneMuted, () => false);
  const music = useMusic();
  const p = usePlayer();
  return {
    output: own.output,
    muted: !on,
    setOutput: (v) => {
      set({ output: v });
      // dragging the fader up from silence un-mutes, like the volume keys on a Mac
      if (v > 0 && !useOS.getState().sound) useOS.getState().setSound(true);
    },
    setMuted: (m) => useOS.getState().setSound(!m),
    field: !fieldMuted,
    setField: (yes) => setSceneMuted(!yes),
    music: music.volume,
    musicMuted: music.muted,
    setMusic: (v) => {
      setMusicVolume(v);
      if (v > 0 && music.muted) setMusicMuted(false);
    },
    setMusicMuted,
    ambience: own.ambience,
    setAmbience: (v) => set({ ambience: v }),
    player: p.vol,
    setPlayer: (v) => player.volume(v),
  };
}
