"use client";

// The music player: one <audio> for the whole OS. Loaded with the shell, because the menu bar, the Dynamic
// Island and the live wallpaper all read it.

import { useSyncExternalStore } from "react";
import { playableTracks as tracks } from "@/content";
import { getAnalyser, tapMediaElement } from "@/lib/audio";
import { useOS } from "@/store";

// `vol` is the player's own volume (0 to 1): Records and Settings both show it
type PlayerState = { id: string | null; playing: boolean; t: number; dur: number; vol: number };

let media: HTMLAudioElement | null = null;

let pstate: PlayerState = { id: null, playing: false, t: 0, dur: 0, vol: 1 };

const psubs = new Set<() => void>();

const pset = (p: Partial<PlayerState>) => {
  pstate = { ...pstate, ...p };
  psubs.forEach((f) => f());
};

export const trackOf = (id: string | null) => tracks.find((t) => t.id === id) ?? null;

function syncNowPlaying() {
  const t = trackOf(pstate.id);
  useOS.getState().setPlaying(pstate.playing && t ? t.title : null);
}

function audioEl() {
  if (media) return media;
  const el = new Audio();
  el.preload = "metadata";
  try {
    tapMediaElement(el);
  } catch {}
  el.muted = !useOS.getState().sound;
  useOS.subscribe((s) => {
    el.muted = !s.sound;
  });
  el.addEventListener("timeupdate", () => pset({ t: el.currentTime }));
  el.addEventListener("loadedmetadata", () => pset({ dur: el.duration }));
  el.addEventListener("play", () => {
    pset({ playing: true });
    syncNowPlaying();
  });
  el.addEventListener("pause", () => {
    pset({ playing: false });
    syncNowPlaying();
  });
  el.addEventListener("ended", () => {
    const i = tracks.findIndex((t) => t.id === pstate.id);
    if (i >= 0 && i < tracks.length - 1) player.play(tracks[i + 1].id);
    else pset({ t: 0 });
  });
  media = el;
  return el;
}

export const player = {
  play(id: string) {
    const el = audioEl();
    const t = trackOf(id);
    if (!t?.file) return;
    void (getAnalyser()?.context as AudioContext | undefined)?.resume();
    if (pstate.id !== id) {
      el.src = t.file;
      pset({ id, t: 0, dur: t.duration });
    }
    void el.play().catch(() => {});
  },
  toggle(id?: string) {
    const el = audioEl();
    const target = id ?? pstate.id ?? tracks[0]?.id;
    if (!target) return;
    if (pstate.id === target && pstate.playing) el.pause();
    else player.play(target);
  },
  seek(sec: number) {
    const el = audioEl();
    el.currentTime = sec;
    pset({ t: sec });
  },
  volume(v: number) {
    const vol = Math.max(0, Math.min(1, v));
    audioEl().volume = vol;
    pset({ vol });
  },
  stop() {
    if (!media) return;
    media.pause();
    pset({ id: null, t: 0, playing: false });
    syncNowPlaying();
  },
};

export function usePlayer() {
  return useSyncExternalStore(
    (f) => {
      psubs.add(f);
      return () => psubs.delete(f);
    },
    () => pstate,
    () => pstate,
  );
}
