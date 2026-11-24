import { useSyncExternalStore } from "react";
import { setMuffled } from "@/lib/audio";

// The scene's pause: the frame loop stops (plane, eye, world time, moments and particles all hold where they are),
// the picture dims under a small label, and all sound pauses with it (it carries on from where it stood). P or the button toggles it; a hidden tab
// pauses it too (and is let go when the tab comes back, unless it was paused by hand).
let paused = false;
let byHand = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const isPaused = () => paused;
export function setPaused(on: boolean, hand = true) {
  if (hand) byHand = on;
  if (!on && !hand && byHand) return;
  if (paused === on) return;
  paused = on;
  setMuffled(on);
  emit();
}
export const togglePause = () => setPaused(!paused, true);
export function usePaused() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    isPaused,
    () => false,
  );
}
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => setPaused(document.visibilityState !== "visible", false));
