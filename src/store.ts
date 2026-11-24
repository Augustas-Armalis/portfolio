import { create } from "zustand";
import { wallpapers, type AppId, type UserId } from "@/content";

// "room": the 3D desk. "login": the OS is on the display, either its lock screen or its desktop (isUp says which).
// The OS never sets "os": going from the lock screen to the desktop is the OS's own move, on one screen, so nothing
// outside it is told to swap pages.
export type Phase = "room" | "login" | "os";
export type Win = { id: AppId; z: number; min: boolean; max: boolean };
type Origin = { x: number; y: number; w: number; h: number };

type OS = {
  phase: Phase;
  isMobile: boolean | null;
  // one desktop: this only says whether it's unlocked (the value is never shown)
  user: UserId | null;
  windows: Win[];
  topZ: number;
  sound: boolean;
  playing: string | null;
  palette: boolean;
  phoneApp: AppId | null;
  // where the tapped phone icon sits, so the app can grow out of it and shrink back into it
  phoneOrigin: Origin | null;
  // the apps under the open one, oldest first: an app opened from inside another is pushed over it, as iOS pushes
  // a screen, and Back (or a swipe from the left edge) pops it off again
  phoneBelow: AppId[];
  // how the open app came in: grown out of a home screen icon, or pushed in from the right
  phoneEnter: "icon" | "push";
  // apps opened this visit, the latest first: the app switcher's cards
  phoneRecents: AppId[];
  phoneSwitcher: boolean;
  setPhoneSwitcher: (on: boolean) => void;
  closeRecent: (id: AppId) => void;
  // last dock launch, so the dock icon can bounce
  launch: { id: AppId; t: number } | null;
  // whether the first OS frame should appear without its own entrance (the 3D screen already showed it)
  seamless: boolean;
  // power states
  sleeping: boolean;
  restarting: boolean;
  // when the restart began (ms): the boot frame runs on this clock, whichever screen is under it
  restartAt: number;
  locked: boolean;
  // how the desktop was reached: from the lock screen (its face dissolves over the desktop) or straight from the intro
  entry: "lock" | "boot";
  // Shut Down returns to the 3D intro with the screen off (read by the intro)
  introOff: boolean;
  // chosen desktop picture (index into wallpapers); -1 until one is chosen, which means the default for the device
  wallpaper: number;
  // Light, Dark or Auto (follows the system); icons can be tinted
  appearance: "light" | "dark" | "auto";
  tintedIcons: boolean;
  setAppearance: (a: "light" | "dark" | "auto") => void;
  setTintedIcons: (on: boolean) => void;
  // Reduce effects: glass becomes a solid material and the large motions become fades
  reduceEffects: boolean;
  setReduceEffects: (on: boolean) => void;
  // live activity in the Dynamic Island (besides music, which it reads from the player)
  activity: { kind: "sent" | "shutdown"; t: number } | null;
  setActivity: (a: { kind: "sent" | "shutdown" } | null) => void;
  // a dark hero sits under the phone status bar: its text turns white
  heroDark: boolean;
  setHeroDark: (on: boolean) => void;
  // image files dropped onto the desktop (from Shots, Gallery, project previews)
  files: { id: string; name: string; src: string }[];
  addFile: (f: { name: string; src: string }) => string;
  // full-screen overlays on the desktop: the Apps grid and the window overview
  overlay: "apps" | "mission" | null;
  setOverlay: (o: "apps" | "mission" | null) => void;
  // desktop items dragged to the Trash (ids from desktopItems), in the order they went in
  trash: string[];
  // emptied from the Trash: gone for this visit
  deleted: string[];
  trashed: (ids: string[]) => void;
  putBack: (ids: string[]) => void;
  emptyTrash: () => void;

  // the note Notes shows (set before opening it, so a file in Documents can open on its note)
  note: string;
  setNote: (id: string) => void;
  // the pane System Settings shows (About's More Info opens it on "about")
  settingsPane: string;
  setSettingsPane: (id: string) => void;

  setMobile: (m: boolean) => void;
  finishIntro: (target?: UserId) => void;
  login: (u?: UserId) => void;
  lockScreen: () => void;
  sleep: (on: boolean) => void;
  restart: () => void;
  shutdown: () => void;
  open: (id: AppId) => void;
  close: (id: AppId) => void;
  focus: (id: AppId) => void;
  toggleMin: (id: AppId) => void;
  toggleMax: (id: AppId) => void;
  setSound: (on: boolean) => void;
  setPlaying: (what: string | null) => void;
  setPalette: (open: boolean) => void;
  openPhoneApp: (id: AppId | null, origin?: Origin) => void;
  phoneBack: () => void;
  // a page to show in the Browser (desktop); a phone opens it in a new tab instead
  browserUrl: { url: string; t: number } | null;
  openUrl: (url: string) => void;
  setWallpaper: (i: number) => void;
};

// The pictures a new visitor gets. The Mac's is the one the 3D display shows on its lock face (scene/lock.ts), so
// the push-in, the lock screen and the desktop are one picture; the phone's is calmer still, for the icon labels.
const MAC_WALLPAPER = Math.max(0, wallpapers.findIndex((w) => w.src.includes("foggy-sunrise")));
const PHONE_WALLPAPER = Math.max(0, wallpapers.findIndex((w) => w.src.includes("golden-peaks")));

// the desktop opens already in use: his music is up
const firstWindows = (): Win[] => [{ id: "records", z: 11, min: false, max: false }];

export const useOS = create<OS>((set, get) => ({
  phase: "room",
  isMobile: null,
  user: null,
  windows: [],
  topZ: 10,
  sound: true,
  playing: null,
  palette: false,
  phoneApp: null,
  phoneOrigin: null,
  phoneBelow: [],
  phoneEnter: "icon",
  launch: null,
  seamless: false,
  sleeping: false,
  restarting: false,
  restartAt: 0,
  locked: false,
  entry: "boot",
  introOff: false,
  wallpaper: -1,
  appearance: "light",
  tintedIcons: false,
  setAppearance: (a) => {
    set({ appearance: a });
    try {
      localStorage.setItem("aos.appearance", a);
    } catch {}
  },
  setTintedIcons: (on) => set({ tintedIcons: on }),
  reduceEffects: false,
  setReduceEffects: (on) => {
    set({ reduceEffects: on });
    try {
      localStorage.setItem("aos.reduce", on ? "1" : "0");
    } catch {}
  },
  activity: null,
  setActivity: (a) => set({ activity: a ? { ...a, t: Date.now() } : null }),
  heroDark: false,
  setHeroDark: (on) => set({ heroDark: on }),
  files: [],
  addFile: (f) => {
    const id = `file-${Date.now().toString(36)}`;
    set({ files: [...get().files, { ...f, id }] });
    return id;
  },
  overlay: null,
  setOverlay: (o) => set({ overlay: o }),
  trash: [],
  deleted: [],
  trashed: (ids) => set({ trash: [...get().trash.filter((x) => !ids.includes(x)), ...ids] }),
  putBack: (ids) => set({ trash: get().trash.filter((x) => !ids.includes(x)) }),
  emptyTrash: () => set({ deleted: [...get().deleted, ...get().trash], trash: [] }),

  note: "now",
  setNote: (id) => set({ note: id }),
  settingsPane: "appearance",
  setSettingsPane: (id) => set({ settingsPane: id }),

  setMobile: (m) => set({ isMobile: m }),
  finishIntro: (target) => {
    set({ seamless: true, introOff: false });
    if (target) get().login(target);
    else set({ phase: "login" });
  },
  login: () => {
    const { locked, user, phase } = get();
    const entry = phase === "login" ? "lock" : "boot";
    // unlocking brings the windows back as they were
    if (locked && user) return set({ phase: "login", locked: false, entry });
    set({ user: "engineer", phase: "login", locked: false, entry, phoneApp: null, phoneBelow: [], phoneSwitcher: false, topZ: 11, windows: firstWindows() });
  },
  lockScreen: () => set({ phase: "login", locked: true, palette: false, overlay: null, phoneApp: null, phoneBelow: [], phoneSwitcher: false, seamless: false }),
  sleep: (on) => set({ sleeping: on }),
  restart: () => {
    // black first (250ms), then the session ends under it; the windows are only dropped once nothing can be seen
    set({ restarting: true, restartAt: Date.now(), palette: false, playing: null, overlay: null });
    window.setTimeout(() => set({ user: null, windows: [], phoneApp: null, phoneBelow: [], phoneSwitcher: false, locked: false, seamless: false, phase: "login" }), 500);
    window.setTimeout(() => set({ restarting: false }), 3300);
  },
  shutdown: () =>
    set({ user: null, phase: "room", windows: [], phoneApp: null, phoneBelow: [], phoneSwitcher: false, palette: false, playing: null, seamless: false, locked: false, introOff: true }),
  open: (id) => {
    const { windows, topZ } = get();
    const z = topZ + 1;
    const found = windows.find((w) => w.id === id);
    set({
      topZ: z,
      launch: found ? get().launch : { id, t: Date.now() },
      windows: found ? windows.map((w) => (w.id === id ? { ...w, min: false, z } : w)) : [...windows, { id, z, min: false, max: false }],
    });
  },
  // closing the front window hands focus to the next one down, like macOS
  close: (id) => {
    const windows = get().windows.filter((w) => w.id !== id);
    set({ windows, topZ: Math.max(get().topZ, 11) });
    const next = windows.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
    if (next) set({ topZ: next.z });
  },
  focus: (id) => {
    const { windows, topZ } = get();
    if (windows.find((w) => w.id === id)?.z === topZ) return;
    set({ topZ: topZ + 1, windows: windows.map((w) => (w.id === id ? { ...w, z: topZ + 1 } : w)) });
  },
  toggleMin: (id) => {
    const windows = get().windows.map((w) => (w.id === id ? { ...w, min: !w.min } : w));
    const me = windows.find((w) => w.id === id);
    // minimising hands focus on; restoring brings the window to the front
    if (me && !me.min) {
      const z = get().topZ + 1;
      return set({ topZ: z, windows: windows.map((w) => (w.id === id ? { ...w, z } : w)) });
    }
    const next = windows.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0];
    set({ windows, ...(next ? { topZ: next.z } : {}) });
  },
  toggleMax: (id) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, max: !w.max } : w)) }),
  setSound: (on) => set({ sound: on }),
  setPlaying: (what) => set({ playing: what }),
  setPalette: (open) => set({ palette: open }),
  openPhoneApp: (id, origin) =>
    set((s) => {
      if (!id) return { phoneApp: null, phoneBelow: [] };
      // every app opened is the switcher's latest card
      const seen = { phoneRecents: [id, ...s.phoneRecents.filter((x) => x !== id)].slice(0, 8), phoneSwitcher: false };
      // from a home screen icon (or a widget, or a switcher card): a fresh start, grown out of it
      if (origin) return { ...seen, phoneApp: id, phoneOrigin: origin, phoneBelow: [], phoneEnter: "icon" };
      if (s.phoneApp === id) return seen;
      if (!s.phoneApp) return { ...seen, phoneApp: id, phoneBelow: [], phoneEnter: "push" };
      // already further down: go back to it rather than open it twice
      const at = s.phoneBelow.indexOf(id);
      if (at >= 0) return { ...seen, phoneApp: id, phoneBelow: s.phoneBelow.slice(0, at) };
      return { ...seen, phoneApp: id, phoneBelow: [...s.phoneBelow, s.phoneApp], phoneEnter: "push" };
    }),
  phoneRecents: [],
  phoneSwitcher: false,
  setPhoneSwitcher: (on) => set({ phoneSwitcher: on }),
  closeRecent: (id) => set((s) => ({ phoneRecents: s.phoneRecents.filter((x) => x !== id) })),
  phoneBack: () => set((s) => (s.phoneBelow.length ? { phoneApp: s.phoneBelow[s.phoneBelow.length - 1], phoneBelow: s.phoneBelow.slice(0, -1) } : { phoneApp: null })),
  browserUrl: null,
  openUrl: (url) => {
    if (get().isMobile) {
      window.open(url, "_blank", "noopener");
      return;
    }
    set({ browserUrl: { url, t: Date.now() } });
    get().open("browser");
  },
  setWallpaper: (i) => set({ wallpaper: i }),
}));

// The session is up: signed in and not locked (the desktop on a Mac, the home screen on a phone).
export const isUp = (s: { phase: Phase; user: UserId | null; locked: boolean }) => s.phase !== "room" && !!s.user && !s.locked;

// The app that is focused right now (top of the stack, not minimised).
export function focusedApp(windows: Win[]): AppId | null {
  const live = windows.filter((w) => !w.min);
  if (!live.length) return null;
  return live.reduce((a, b) => (a.z > b.z ? a : b)).id;
}

// The picture in use. Until one is chosen the Mac gets the first and the phone a calmer one: icon labels and
// the lock screen clock have to read over it.
export function useWallpaperIndex() {
  const i = useOS((s) => s.wallpaper);
  const mobile = useOS((s) => s.isMobile);
  return wallpapers[i] ? i : mobile ? PHONE_WALLPAPER : MAC_WALLPAPER;
}
export function useWallpaper() {
  const w = wallpapers[useWallpaperIndex()];
  // a phone shows the portrait crop of the same picture
  const mobile = useOS((s) => s.isMobile);
  return mobile && w.phone ? { ...w, src: w.phone } : w;
}

// dev only: lets the QA pass drive the OS from the console
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { os: typeof useOS }).os = useOS;
