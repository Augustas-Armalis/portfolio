"use client";

// Sound, as System Settings sees it: every level the visitor can set, read and written through this one file.
// The Sound pane (system.tsx) only knows the shape `useSound()` returns.
//
// Where each level lives:
//   output, mute, field music, ambience   lib/soundSettings.ts (master, muted, fieldMusic, ambience): the shared
//                                         store the audio manager, the music director and the ambience listen to.
//                                         It remembers them. `muted` is the system's Sound switch, the same one
//                                         Control Centre and the field's pill throw.
//   Music app                             the Records player's own volume (apps/player.tsx), the value Records shows.
// Sliders run 0 to 1. Output at 1 is the site as it was mixed; field music and ambience sit at 0.7 as mixed and
// go a little louder above it.

import { SOUND_DEFAULTS, setSoundSettings, useSoundSettings } from "@/lib/soundSettings";
import { player, usePlayer } from "./player";

export type Sound = {
  /** everything the site plays, and whether it is muted */
  output: number;
  muted: boolean;
  setOutput: (v: number) => void;
  setMuted: (m: boolean) => void;
  /** the field's own music */
  music: number;
  setMusic: (v: number) => void;
  /** wind, waves and birds */
  ambience: number;
  setAmbience: (v: number) => void;
  /** the Music app (Records) */
  player: number;
  setPlayer: (v: number) => void;
  /** whether anything differs from the levels the site was mixed at, and the way back to them */
  changed: boolean;
  reset: () => void;
};

export function useSound(): Sound {
  const s = useSoundSettings();
  const p = usePlayer();
  return {
    output: s.master,
    muted: s.muted,
    // dragging the fader up from silence un-mutes, like the volume keys on a Mac
    setOutput: (v) => setSoundSettings(v > 0 && s.muted ? { master: v, muted: false } : { master: v }),
    setMuted: (m) => setSoundSettings({ muted: m }),
    music: s.fieldMusic,
    setMusic: (v) => setSoundSettings({ fieldMusic: v }),
    ambience: s.ambience,
    setAmbience: (v) => setSoundSettings({ ambience: v }),
    player: p.vol,
    setPlayer: (v) => player.volume(v),
    changed: s.muted !== SOUND_DEFAULTS.muted || s.master !== SOUND_DEFAULTS.master || s.fieldMusic !== SOUND_DEFAULTS.fieldMusic || s.ambience !== SOUND_DEFAULTS.ambience || p.vol !== 1,
    reset: () => {
      setSoundSettings(SOUND_DEFAULTS);
      player.volume(1);
    },
  };
}
