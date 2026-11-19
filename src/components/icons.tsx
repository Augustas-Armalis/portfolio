import {
  Aperture,
  BookOpen,
  Clapperboard,
  Component,
  Disc3,
  Box,
  Flower2,
  Folder,
  Megaphone,
  ShoppingBag,
  Mail,
  Music,
  Gamepad2,
  Image as ImageIcon,
  Images,
  Layers,
  Send,
  LayoutGrid,
  MousePointer2,
  Music2,
  Palette,
  Settings,
  Trash2,
  SkipForward,
  Skull,
  SquareTerminal,
  UserRound,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AppId } from "@/content";
import { marks } from "./marks";

// One icon family: a squircle base (two-stop gradient), a glass glyph with a soft
// drop, a specular sheen across the top, and a depth shadow under the tile.
type Spec = { bg: [string, string]; glyph: LucideIcon | `mark:${string}` | "art:piano"; fg: "light" | "dark" };

export const ICONS: Record<AppId, Spec> = {
  projects: { bg: ["#7ccbff", "#2f8fe8"], glyph: Folder, fg: "light" },
  sellify: { bg: ["#8597ff", "#3c50d6"], glyph: Megaphone, fg: "light" },
  kaching: { bg: ["#ffcf4d", "#f29a0c"], glyph: ShoppingBag, fg: "light" },
  shots: { bg: ["#ff7fb5", "#ee2f7c"], glyph: Images, fg: "light" },
  taste: { bg: ["#62e08c", "#1bb04f"], glyph: Palette, fg: "light" },
  kit: { bg: ["#52d9ea", "#0c9bc2"], glyph: Component, fg: "light" },
  larpo: { bg: ["#44598c", "#141d33"], glyph: Aperture, fg: "light" },
  lunor: { bg: ["#2a2a31", "#060607"], glyph: "mark:lunor", fg: "light" },
  capto: { bg: ["#ffffff", "#e3e5ea"], glyph: "mark:capto", fg: "dark" },
  contles: { bg: ["#6c7bff", "#3443d8"], glyph: "mark:contles", fg: "light" },
  filzy: { bg: ["#1f2023", "#050505"], glyph: "mark:filzy", fg: "light" },
  filzymovie: { bg: ["#4a3486", "#150c2e"], glyph: Clapperboard, fg: "light" },
  rug: { bg: ["#d8b48c", "#9a6c45"], glyph: Layers, fg: "light" },
  slideskipper: { bg: ["#ffd36a", "#f2a531"], glyph: SkipForward, fg: "light" },
  musicengine: { bg: ["#4c5fd1", "#1f2b78"], glyph: Music2, fg: "light" },
  trackpad: { bg: ["#ffffff", "#dfe2e8"], glyph: MousePointer2, fg: "dark" },
  reel: { bg: ["#ff6a5c", "#d3352a"], glyph: Clapperboard, fg: "light" },
  openwhip: { bg: ["#8a5cff", "#5328d1"], glyph: Zap, fg: "light" },
  doom: { bg: ["#8c1d12", "#2b0705"], glyph: Skull, fg: "light" },
  blocks: { bg: ["#7fd88a", "#2f9c5c"], glyph: Box, fg: "light" },
  games: { bg: ["#7ccbff", "#2f8fe8"], glyph: Gamepad2, fg: "light" },
  records: { bg: ["#ff5f7a", "#e5203f"], glyph: Music, fg: "light" },
  piano: { bg: ["#50535e", "#15161a"], glyph: "art:piano", fg: "light" },
  novel: { bg: ["#ffb057", "#e8721f"], glyph: BookOpen, fg: "light" },
  gallery: { bg: ["#5cdcd0", "#0e9fa6"], glyph: Flower2, fg: "light" },
  about: { bg: ["#8eaad4", "#48649a"], glyph: UserRound, fg: "light" },
  contact: { bg: ["#5ac8ff", "#0a6cf0"], glyph: Mail, fg: "light" },
  terminal: { bg: ["#2f3137", "#0d0e10"], glyph: SquareTerminal, fg: "light" },
  game: { bg: ["#4cd97b", "#1f9d4a"], glyph: Gamepad2, fg: "light" },
  settings: { bg: ["#c2c7d1", "#737a86"], glyph: Settings, fg: "light" },
  trash: { bg: ["#f4f5f7", "#d9dce2"], glyph: Trash2, fg: "dark" },
  launchpad: { bg: ["#a08fff", "#5a41ee"], glyph: LayoutGrid, fg: "light" },
};

export function iconBackground(id: AppId) {
  const [a, b] = ICONS[id].bg;
  return `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
}

// The glass glyph: a vertical light falloff (bright at the top, like light through glass) on every glyph.
const GLASS = { light: "url(#aos-glass)", dark: "url(#aos-glass-ink)" };
export function GlyphDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        <linearGradient id="aos-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".74" />
        </linearGradient>
        <linearGradient id="aos-glass-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3d45" />
          <stop offset="1" stopColor="#15161a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Glyph({ id, size }: { id: AppId; size: number }) {
  const g = ICONS[id].glyph;
  const paint = GLASS[ICONS[id].fg];
  // the piano is drawn here: three ivory keys with the black keys cut out of them
  if (g === "art:piano") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={paint} className="glyph-mark">
        <path d="M4.5 5h2v7.5H8V19H4.5A2.5 2.5 0 0 1 2 16.5v-9A2.5 2.5 0 0 1 4.5 5z" />
        <path d="M10.5 5h3v7.5H15V19H9v-6.5h1.5z" />
        <path d="M17.5 5h2A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5H16v-6.5h1.5z" />
      </svg>
    );
  }
  if (typeof g === "string") {
    const m = marks[g.slice(5)];
    return (
      <svg width={size} height={size} viewBox={m.vb} aria-hidden fill={paint} className="glyph-mark">
        {m.d.map((d, i) => (
          <path key={i} d={d} fillRule="evenodd" clipRule="evenodd" />
        ))}
      </svg>
    );
  }
  const I = g;
  return <I size={size} strokeWidth={1.75} stroke={paint} aria-hidden className="glyph-line" />;
}

export function AppIcon({ id, size = 52, flat = false }: { id: AppId; size?: number; flat?: boolean }) {
  const s = ICONS[id];
  // Projects is a folder, so it looks like one (the Finder folder, as in the Dock's stacks)
  if (id === "projects" || id === "games") return <FolderArt size={size} badge={id === "games" ? "games" : undefined} />;
  return (
    <div className={flat ? "" : "icon-wrap"} style={{ width: size, height: size, ["--ia" as string]: s.bg[0], ["--ib" as string]: s.bg[1] }} aria-hidden>
      <GlyphDefs />
      <div className="icon-sq" style={{ background: iconBackground(id) }}>
        <div className="icon-glow" />
        <div className={`icon-glyph ${s.fg === "light" ? "is-light" : "is-dark"}`}>
          <Glyph id={id} size={Math.round(size * (typeof s.glyph === "string" ? 0.5 : 0.48))} />
        </div>
        <div className="icon-spec" />
      </div>
    </div>
  );
}

// ---------- desktop artwork (64px): a Finder folder and a document page ----------

export function FolderArt({ size = 64, badge }: { size?: number; badge?: "games" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="fa-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fb2f5" />
          <stop offset="1" stopColor="#3d93e0" />
        </linearGradient>
        <linearGradient id="fa-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#5bb0f2" />
        </linearGradient>
      </defs>
      <path d="M6 15.5C6 13 8 11 10.5 11h13.2c1.3 0 2.5.6 3.3 1.6l2.2 2.8c.6.7 1.4 1.1 2.3 1.1H53.5c2.5 0 4.5 2 4.5 4.5V49c0 2.5-2 4.5-4.5 4.5h-43C8 53.5 6 51.5 6 49V15.5z" fill="url(#fa-back)" />
      <path d="M6 23.5c0-2.2 1.8-4 4-4h44c2.2 0 4 1.8 4 4V49.5c0 2.2-1.8 4-4 4H10c-2.2 0-4-1.8-4-4V23.5z" fill="url(#fa-front)" />
      <path d="M10 20h44c2 0 3.5 1.4 3.9 3.2" stroke="#fff" strokeOpacity=".55" strokeWidth="1" fill="none" />
      {/* a folder for one kind of thing carries its mark, pressed into the front like a system folder */}
      {badge === "games" && (
        <g fill="none" stroke="#2f7fd0" strokeOpacity=".7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M25 31h14a6 6 0 0 1 6 6v0a5 5 0 0 1-9 3l-1-1.5h-6L28 40a5 5 0 0 1-9-3v0a6 6 0 0 1 6-6z" />
          <path d="M26 35.5v4M24 37.5h4" />
          <circle cx="38.5" cy="37" r=".6" fill="#2f7fd0" />
        </g>
      )}
    </svg>
  );
}

export function DocArt({ size = 64, label = "PDF" }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M14 6.5h25.5L52 19v37c0 1.4-1.1 2.5-2.5 2.5h-35A2.5 2.5 0 0 1 12 56V9c0-1.4 1.1-2.5 2.5-2.5z" fill="#fff" stroke="#000" strokeOpacity=".12" />
      <path d="M39.5 6.5V16c0 1.7 1.3 3 3 3H52" fill="#eef0f3" stroke="#000" strokeOpacity=".12" />
      {[27, 31, 35, 39].map((y, i) => (
        <rect key={y} x="18" y={y} width={i === 3 ? 16 : 28} height="1.6" rx=".8" fill="#c9ccd3" />
      ))}
      <rect x="18" y="45" width="17" height="8" rx="2" fill="#e5484d" />
      <text x="26.5" y="51.2" textAnchor="middle" fontSize="5.6" fontWeight="700" fill="#fff" fontFamily="-apple-system, system-ui, sans-serif">
        {label}
      </text>
    </svg>
  );
}

// The dock's Trash: a frosted wire bin, with paper showing when it holds something.
export function TrashArt({ size = 50, full = false }: { size?: number; full?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="tb-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".92" />
          <stop offset="1" stopColor="#dfe2e8" stopOpacity=".86" />
        </linearGradient>
      </defs>
      {full && (
        <g>
          <path d="M20 16l9-6 8 4 7-3 2 8H19z" fill="#fff" stroke="#000" strokeOpacity=".12" />
          <path d="M24 13l12 3" stroke="#c9ccd3" strokeWidth="1.2" />
        </g>
      )}
      <path d="M13 14.5h38l-3.2 41.2a4 4 0 0 1-4 3.8H20.2a4 4 0 0 1-4-3.8L13 14.5z" fill="url(#tb-body)" stroke="#000" strokeOpacity=".14" />
      {[22, 28, 34, 40].map((x) => (
        <path key={x} d={`M${x} 20v33`} stroke="#000" strokeOpacity=".08" strokeWidth="1.2" />
      ))}
      <rect x="11" y="11" width="42" height="5" rx="2.5" fill="#f7f8fa" stroke="#000" strokeOpacity=".16" />
    </svg>
  );
}
