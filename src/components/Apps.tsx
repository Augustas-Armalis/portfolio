"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { projects, type AppId } from "@/content";
import { AppIcon } from "./icons";
import MusicShader from "./scene/MusicShader";
import { useChrome } from "./ui";

// Each app is its own chunk, fetched the first time it is opened (and warmed up when the machine is idle,
// so a window never opens empty). Only the shell, the icons and the player load with the desktop.
const loaders = {
  projects: () => import("./apps/projects"),
  photos: () => import("./apps/photos"),
  gallery: () => import("./apps/gallery"),
  taste: () => import("./apps/taste"),
  doom: () => import("./apps/doom"),
  piano: () => import("./apps/piano"),
  records: () => import("./apps/records"),
  novel: () => import("./apps/novel"),
  contact: () => import("./apps/contact"),
  system: () => import("./apps/system"),
  finder: () => import("./apps/finder"),
  notes: () => import("./apps/notes"),
  browser: () => import("./apps/browser"),
};
// The desktop opens with Music up: its code is fetched as soon as the lock screen shows, so the first window has
// its content the moment it opens.
export const warmFirstWindow = () => void loaders.records().catch(() => undefined);
// Fetch every app's code once the machine is idle (not on a data-saver connection), so the first open is instant.
let warmed = false;
export function warmApps() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
  const run = () => Object.values(loaders).forEach((load) => void load().catch(() => undefined));
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 2500);
}
const lazy = <P extends object>(load: () => Promise<React.ComponentType<P>>) => dynamic(load, { ssr: false, loading: () => null });
const ProjectApp = lazy(() => loaders.projects().then((x) => x.ProjectApp));
const Shots = lazy(() => loaders.photos().then((x) => x.Shots));
const Gallery = lazy(() => loaders.gallery().then((x) => x.Gallery));
const Taste = lazy(() => loaders.taste().then((x) => x.Taste));
const Kit = lazy(() => loaders.taste().then((x) => x.Kit));
const Doom = lazy(() => loaders.doom().then((x) => x.Doom));
const PianoApp = lazy(() => loaders.piano().then((x) => x.PianoApp));
const Records = lazy(() => loaders.records().then((x) => x.Records));
const Novel = lazy(() => loaders.novel().then((x) => x.Novel));
const Contact = lazy(() => loaders.contact().then((x) => x.Contact));
const TrashApp = lazy(() => loaders.system().then((x) => x.TrashApp));
const About = lazy(() => loaders.system().then((x) => x.About));
const Terminal = lazy(() => loaders.system().then((x) => x.Terminal));
const Game = lazy(() => loaders.system().then((x) => x.Game));
const SettingsApp = lazy(() => loaders.system().then((x) => x.SettingsApp));
const Finder = lazy(() => loaders.finder().then((x) => x.Finder));
const Notes = lazy(() => loaders.notes().then((x) => x.Notes));
const BrowserApp = lazy(() => loaders.browser().then((x) => x.BrowserApp));

// The live shader, with a still photo under it: if WebGL is missing or its context is lost, the photo shows
// instead of a blank canvas.
export function LiveWallpaper({ fallback = "/wallpapers/art-bernd-dittrich.webp", intensity = 1 }: { fallback?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const lost = () => setOk(false);
    let canvas: HTMLCanvasElement | null = null;
    const t = window.setTimeout(() => {
      canvas = root.querySelector("canvas");
      if (!canvas) return setOk(false);
      const gl = (canvas.getContext("webgl") ?? canvas.getContext("webgl2")) as WebGLRenderingContext | null;
      if (!gl || gl.isContextLost()) return setOk(false);
      canvas.addEventListener("webglcontextlost", lost);
    }, 400);
    return () => {
      window.clearTimeout(t);
      canvas?.removeEventListener("webglcontextlost", lost);
    };
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 bg-[#070b16] bg-cover bg-center" style={{ backgroundImage: `url(${fallback})` }}>
      {ok && (
        <div className="absolute inset-0">
          <MusicShader intensity={intensity} palette="night" />
        </div>
      )}
    </div>
  );
}

const Blocks = dynamic(() => import("./games/Blocks"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-black text-[13px] text-white/50">Loading…</div> });

function BlocksApp() {
  const { compact } = useChrome();
  return (
    <div className={`bg-black ${compact ? "fixed inset-0" : "relative h-full"}`}>
      <Blocks compact={compact} />
    </div>
  );
}

export function AppView({ id }: { id: AppId }) {
  if (projects[id]) return <ProjectApp id={id} />;
  switch (id) {
    case "projects":
      return <Finder start="projects" />;
    case "games":
      return <Finder start="games" />;
    case "blocks":
      return <BlocksApp />;
    case "shots":
      return <Shots />;
    case "taste":
      return <Taste />;
    case "kit":
      return <Kit />;
    case "doom":
      return <Doom />;
    case "records":
      return <Records />;
    case "piano":
      return <PianoApp />;
    case "novel":
      return <Novel />;
    case "notes":
      return <Notes />;
    case "gallery":
      return <Gallery />;
    case "about":
      return <About />;
    case "contact":
      return <Contact />;
    case "trash":
      return <TrashApp />;
    case "terminal":
      return <Terminal />;
    case "browser":
      return <BrowserApp />;
    case "game":
      return <Game />;
    case "settings":
      return <SettingsApp />;
    default:
      return null;
  }
}

export { AppIcon };
export { player, usePlayer } from "./apps/player";
