"use client";

import { Brain, GitBranch, Zap, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import type { AppId } from "@/content";
import { Sym } from "./symbols";

// App icons, three kinds:
//  1. System apps show a file from public/icons/system: a licensed macOS-style set (WhiteSur, GPL-3.0; see
//     CREDITS.md). Each file already has its squircle, so it is shown as a plain image with nothing laid over it
//     and never recoloured (dark and tinted leave it alone). Folders and the Trash come from the same set.
//  2. Projects wear their real logo (LOGOS below).
//  3. Piano has no file in the set that reads as a piano, so it keeps one drawing on the same squircle.
//  4. The Lab's repositories have no logo: each wears its own tile (a colour and a Lucide glyph for what it
//     does) with a badge for the language it is written in (REPOS below).

const SYS = "/icons/system/";
export const SYSTEM_ICONS: Partial<Record<AppId, string>> = {
  records: "music.svg",
  novel: "books.svg",
  notes: "notes.svg",
  shots: "photos.svg",
  gallery: "preview.svg",
  taste: "palette.svg",
  kit: "design.svg",
  doom: "doom.svg",
  blocks: "games.svg",
  game: "games.svg",
  contact: "mail.svg",
  terminal: "terminal.svg",
  browser: "browser.svg",
  settings: "settings.svg",
  about: "about.svg",
  launchpad: "apps.svg",
  trash: "trash.svg",
  // folders
  projects: "folder-code.svg",
  games: "folder-games.svg",
};
// what a Finder folder holds, by the mark on its front
export type FolderGlyph = "projects" | "games" | "music" | "photos" | "documents";
const FOLDERS: Record<FolderGlyph | "plain", string> = {
  plain: "folder.svg",
  projects: "folder-code.svg",
  games: "folder-games.svg",
  music: "folder-music.svg",
  photos: "folder.svg",
  documents: "folder-documents.svg",
};
const isFolder = (file: string) => file.startsWith("folder") || file.startsWith("trash");

// A file from the set. The artwork sits inside its own canvas with a margin, so it is drawn a little over size
// to stand as large as a project logo beside it. App icons take the family's soft drop shadow; folders and the
// Trash stay flat, like Finder's.
function FileIcon({ file, size, flat = false }: { file: string; size: number | string; flat?: boolean }) {
  const app = !isFolder(file);
  return (
    <span aria-hidden className={`relative block shrink-0 ${app && !flat ? "icon-wrap" : ""}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SYS + file} alt="" draggable={false} decoding="async" className="icon-file absolute max-w-none" style={app ? { inset: "-6%", width: "112%", height: "112%" } : { inset: 0, width: "100%", height: "100%" }} />
    </span>
  );
}

type Stop = [offset: number, color: string, opacity?: number];
const lin = (id: string, s: Stop[]) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
    {s.map(([o, c, a], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={a} />
    ))}
  </linearGradient>
);
function Base({ u, a, b }: { u: string; a: string; b: string }) {
  return (
    <>
      <defs>{lin(`${u}b`, [[0, a], [1, b]])}</defs>
      <rect width="64" height="64" fill={`url(#${u}b)`} />
    </>
  );
}


// A grass block in isometric pixels: each face is an 8 by 8 grid mapped onto the cube with a matrix, the colours
// picked by a small fixed hash so every block icon is the same.
const hash = (x: number, y: number, k: number) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return n - Math.floor(n);
};
const pick = (pal: string[], x: number, y: number, k: number) => pal[Math.floor(hash(x, y, k) * pal.length)];
const GRASS = ["#6cc644", "#5db83a", "#79d050", "#57ad35"];
const DIRT = ["#8b5a34", "#7a4d2b", "#96653d", "#6f4527"];
function Face({ m, k, shade }: { m: string; k: number; shade: number }) {
  const px: ReactNode[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      // the top is all grass; on the sides grass hangs over the dirt for a pixel or two
      const grass = k === 0 || y < 2 || (y === 2 && hash(x, 0, k) > 0.5);
      px.push(<rect key={`${x}-${y}`} x={x} y={y} width="1.04" height="1.04" fill={pick(grass ? GRASS : DIRT, x, y, k)} />);
    }
  return (
    <g transform={`matrix(${m})`}>
      {px}
      <rect width="8" height="8" fill="#000" opacity={shade} />
    </g>
  );
}
function Cube({ u }: { u: string }) {
  return (
    <>
      <Base u={u} a="#8fd3ff" b="#3c86ee" />
      <g fill="#fff" opacity=".9">
        <rect x="45" y="9" width="6" height="6" />
        <rect x="44" y="10" width="8" height="4" />
      </g>
      <ellipse cx="32" cy="57" rx="19" ry="4" fill="#0b2a5c" opacity=".25" />
      <Face m="2.5 1.375 -2.5 1.375 32 13" k={0} shade={0} />
      <Face m="2.5 1.375 0 2.5 12 24" k={1} shade={0.12} />
      <Face m="2.5 -1.375 0 2.5 32 35" k={2} shade={0.28} />
    </>
  );
}

type Art = (u: string) => ReactNode;
const ART: Partial<Record<AppId, Art>> = {

  // Slidepad: the presentation board from its own mark, with the laser dot
  slidepad: (u) => (
    <>
      <Base u={u} a="#30333b" b="#0c0d10" />
      <g fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 17h38" />
        <path d="M48 17v20a3.5 3.5 0 0 1-3.5 3.5h-25A3.5 3.5 0 0 1 16 37V17" />
        <path d="m23 51 9-9 9 9" />
      </g>
      <circle cx="38.5" cy="28" r="7.5" fill="#ff4d2e" opacity=".22" />
      <circle cx="38.5" cy="28" r="3.6" fill="#ff4d2e" />
    </>
  ),
  // AFilm: its own mark, a serif A under a warm light, between two film edges
  filzymovie: (u) => (
    <>
      <Base u={u} a="#2a2522" b="#070607" />
      <defs>
        <radialGradient id={`${u}l`} cx="50%" cy="42%" r="50%">
          <stop offset="0" stopColor="#f3c27a" stopOpacity=".42" />
          <stop offset="1" stopColor="#f3c27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${u}l)`} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i} fill="#e9c88f" opacity=".55">
          <rect x={6.5 + i * 7.8} y="6" width="3.6" height="4.4" rx="1" />
          <rect x={6.5 + i * 7.8} y="53.6" width="3.6" height="4.4" rx="1" />
        </g>
      ))}
      <text x="32" y="44.5" textAnchor="middle" fontFamily="'Iowan Old Style', 'Times New Roman', Georgia, serif" fontSize="37" fontStyle="italic" fontWeight="600" fill="#fff">
        A
      </text>
    </>
  ),
  // Minecruft: one block of its own world, drawn pixel by pixel on its three faces
  blocks: (u) => <Cube u={u} />,
  // Piano: three ivory keys under the felt
  piano: (u) => (
    <>
      <Base u={u} a="#5a5e6a" b="#111215" />
      <defs>
        {lin(`${u}i`, [[0, "#ffffff"], [1, "#dcdfe5"]])}
        {lin(`${u}k`, [[0, "#42454e"], [1, "#0c0d0f"]])}
      </defs>
      <rect x="11" y="19" width="42" height="33" rx="3" fill="#000" opacity=".35" />
      {[11, 25.2, 39.4].map((x) => (
        <path key={x} d={`M${x} 17h13.2v30.5a2.5 2.5 0 0 1-2.5 2.5h-8.2a2.5 2.5 0 0 1-2.5-2.5Z`} fill={`url(#${u}i)`} />
      ))}
      <rect x="11" y="14" width="41.6" height="3.4" rx="1" fill="#c8323a" />
      {[20.6, 34.8].map((x) => (
        <g key={x}>
          <rect x={x + 0.6} y="17.4" width="8" height="21" rx="1.6" fill="#000" opacity=".25" />
          <rect x={x} y="17" width="8" height="20" rx="1.6" fill={`url(#${u}k)`} />
          <rect x={x + 1.2} y="17" width="5.6" height="15" rx="1" fill="#fff" opacity=".1" />
        </g>
      ))}
    </>
  ),
};

// Projects wear their real logo (public/logos: each project's own official icon), never a drawn stand-in.
// Most are already app icons and fill the squircle; a bare mark (mark: true) sits centred on a plain
// ground.
type Logo = { src: string; bg: string; mark?: boolean };
export const LOGOS: Partial<Record<AppId, Logo>> = {
  larpo: { src: "/logos/larpo.png", bg: "#f2f2f2" },
  capto: { src: "/logos/capto.webp", bg: "#000000" },
  contles: { src: "/logos/contles.png", bg: "#030303" },
  filzy: { src: "/logos/filzy.png", bg: "#050505" },
  lunor: { src: "/logos/lunor.webp", bg: "#161617" },
  // his own app icon, cropped to the rug inside its frame
  rug: { src: "/lab/rug/icon.webp", bg: "#4a4d52" },
};
function LogoImg({ logo, size }: { logo: Logo; size: number | string }) {
  const full = typeof size === "string";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logo.src}
      alt=""
      width={full ? undefined : size}
      height={full ? undefined : size}
      draggable={false}
      decoding="async"
      // a full-bleed icon is drawn a touch over size so its own rounded corners fall outside the squircle
      style={
        logo.mark
          ? { width: full ? "60%" : (size as number) * 0.6, height: full ? "60%" : (size as number) * 0.6, objectFit: "contain" }
          : { width: full ? "105%" : (size as number) * 1.05, height: full ? "105%" : (size as number) * 1.05, maxWidth: "none", objectFit: "cover" }
      }
    />
  );
}

// ---------- badges and repositories ----------
// A badge sits on an icon's bottom right corner, outside its squircle: a language on a repository, a film on
// Language colours are GitHub's.
type BadgeSpec = { text?: string; glyph?: LucideIcon; bg: string; ink?: string };
const LANG = {
  swift: { text: "SW", bg: "#F05138" },
  python: { text: "PY", bg: "#3572A5" },
  ts: { text: "TS", bg: "#3178C6" },
  js: { text: "JS", bg: "#F1E05A", ink: "#1f1f1f" },
  git: { glyph: GitBranch, bg: "#57606A" },
} satisfies Record<string, BadgeSpec>;
type Repo = { glyph: LucideIcon; a: string; b: string; badge?: BadgeSpec };
export const REPOS: Partial<Record<AppId, Repo>> = {
  openwhip: { glyph: Zap, a: "#FFC94A", b: "#E58A07" },
  cortex: { glyph: Brain, a: "#A4AAB6", b: "#5E6472" },
};
export const BADGES: Partial<Record<AppId, BadgeSpec>> = {};
// kept for a repository tile that wants one
export const LANGS = LANG;
function IconBadge({ spec, size }: { spec: BadgeSpec; size: number }) {
  if (size < 34) return null;
  const h = Math.round(size * 0.34);
  return (
    <span
      className="absolute z-[1] flex items-center justify-center font-bold leading-none shadow-[0_0_0_0.5px_rgb(0_0_0/0.18),0_1px_2.5px_rgb(0_0_0/0.32),inset_0_0.5px_0_rgb(255_255_255/0.35)]"
      style={{ right: -size * 0.07, bottom: -size * 0.05, height: h, minWidth: h, padding: spec.text ? `0 ${h * 0.2}px` : 0, borderRadius: h * 0.32, background: spec.bg, color: spec.ink ?? "#fff", fontSize: h * 0.56, letterSpacing: "0.02em" }}
    >
      {spec.glyph ? <Sym icon={spec.glyph} size={h * 0.66} weight="semibold" /> : spec.text}
    </span>
  );
}
function RepoFace({ repo }: { repo: Repo }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(180deg, ${repo.a} 0%, ${repo.b} 100%)`, containerType: "size" }}>
      <div className="icon-glow" />
      {/* the glyph is half the tile, drawn at Lucide's own weight for that size */}
      <repo.glyph className="relative text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.22)]" style={{ width: "52cqw", height: "52cqw", strokeWidth: 2.1 }} aria-hidden />
    </div>
  );
}

function ArtSvg({ art }: { art: Art }) {
  const u = `i${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden className="block">
      {art(u)}
    </svg>
  );
}

// The icon's face filling its box, with no shadow: what the phone grows an app out of.
export function IconFace({ id }: { id: AppId }) {
  const logo = LOGOS[id];
  if (logo)
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden" style={{ background: logo.bg }}>
        <LogoImg logo={logo} size="full" />
      </div>
    );
  const art = ART[id];
  if (art) return <ArtSvg art={art} />;
  const repo = REPOS[id];
  if (repo) return <RepoFace repo={repo} />;
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#f6f7f9_0%,#e4e6eb_100%)]">
      <FileIcon file={SYSTEM_ICONS[id] ?? FOLDERS.plain} size="72%" flat />
    </div>
  );
}

export function AppIcon({ id, size = 52, flat = false }: { id: AppId; size?: number; flat?: boolean }) {
  const logo = LOGOS[id];
  const art = ART[id];
  const repo = REPOS[id];
  const badge = repo?.badge ?? BADGES[id];
  if (!logo && !art && !repo) return <FileIcon file={SYSTEM_ICONS[id] ?? FOLDERS.plain} size={size} flat={flat} />;
  return (
    <div className={`relative shrink-0 ${flat ? "" : "icon-wrap"}`} style={{ width: size, height: size }} aria-hidden>
      {badge && <IconBadge spec={badge} size={size} />}
      {repo ? (
        <div className="icon-sq icon-logo">
          <RepoFace repo={repo} />
        </div>
      ) : logo ? (
        <div className="icon-sq icon-logo flex items-center justify-center" style={{ background: logo.bg }}>
          <LogoImg logo={logo} size={size} />
          <div className="icon-spec opacity-40" />
        </div>
      ) : (
        <div className="icon-sq icon-art">
          <ArtSvg art={art!} />
        </div>
      )}
    </div>
  );
}

// ---------- Finder artwork: folders, documents, the Trash ----------

export function FolderArt({ size = 64, glyph }: { size?: number | string; glyph?: FolderGlyph }) {
  return <FileIcon file={FOLDERS[glyph ?? "plain"]} size={size} />;
}

const SYS_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
const DOC_TONE: Record<string, string> = { PDF: "#e5484d", EPUB: "#f08a00", TXT: "#8e95a3" };
export function DocArt({ size = 64, label = "PDF" }: { size?: number; label?: string }) {
  const w = label.length > 3 ? 21 : 17;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.14)]">
      <path d="M14 6.5h25.5L52 19v37c0 1.4-1.1 2.5-2.5 2.5h-35A2.5 2.5 0 0 1 12 56V9c0-1.4 1.1-2.5 2.5-2.5z" fill="#fff" stroke="#000" strokeOpacity=".2" />
      <path d="M39.5 6.5V16c0 1.7 1.3 3 3 3H52" fill="#e6e8ed" stroke="#000" strokeOpacity=".2" />
      {[27, 31, 35, 39].map((y, i) => (
        <rect key={y} x="18" y={y} width={i === 3 ? 16 : 28} height="1.6" rx=".8" fill="#c9ccd3" />
      ))}
      <rect x="18" y="45" width={w} height="8" rx="2" fill={DOC_TONE[label] ?? DOC_TONE.PDF} />
      <text x={18 + w / 2} y="51.2" textAnchor="middle" fontSize="5.6" fontWeight="700" fill="#fff" fontFamily={SYS_FONT}>
        {label}
      </text>
    </svg>
  );
}

export function TrashArt({ size = 50, full = false }: { size?: number; full?: boolean }) {
  return <FileIcon file={full ? "trash-full.svg" : "trash.svg"} size={size} />;
}
