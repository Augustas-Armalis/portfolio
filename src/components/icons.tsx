"use client";

import { useId, type ReactNode } from "react";
import type { AppId } from "@/content";

// App icons, three kinds:
//  1. System apps show a file from public/icons/system: a licensed macOS-style set (WhiteSur, GPL-3.0; see
//     CREDITS.md). Each file already has its squircle, so it is shown as a plain image with nothing laid over it
//     and never recoloured (dark and tinted leave it alone). Folders and the Trash come from the same set.
//  2. Projects wear their real logo (LOGOS below).
//  3. Piano has no file in the set that reads as a piano, so it keeps one drawing on the same squircle.

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

type Art = (u: string) => ReactNode;
const ART: Partial<Record<AppId, Art>> = {
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
// Most are already app icons and fill the squircle; Sellify's is a bare mark, so it sits centred on a plain
// ground. A project with no logo of its own uses its parent's (Filzy Movie) or a plain folder (the Lab).
type Logo = { src: string; bg: string; mark?: boolean };
export const LOGOS: Partial<Record<AppId, Logo>> = {
  larpo: { src: "/logos/larpo.png", bg: "#f2f2f2" },
  capto: { src: "/logos/capto.png", bg: "#000000" },
  contles: { src: "/logos/contles.png", bg: "#030303" },
  filzy: { src: "/logos/filzy.png", bg: "#050505" },
  filzymovie: { src: "/logos/filzy.png", bg: "#050505" },
  kaching: { src: "/logos/kaching.png", bg: "#ffffff" },
  lunor: { src: "/logos/lunor.webp", bg: "#161617" },
  sellify: { src: "/logos/sellify.svg", bg: "linear-gradient(180deg, #ffffff 0%, #fff0e4 100%)", mark: true },
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
  return (
    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,#f6f7f9_0%,#e4e6eb_100%)]">
      <FileIcon file={SYSTEM_ICONS[id] ?? FOLDERS.plain} size="72%" flat />
    </div>
  );
}

export function AppIcon({ id, size = 52, flat = false }: { id: AppId; size?: number; flat?: boolean }) {
  const logo = LOGOS[id];
  const art = ART[id];
  // anything without a logo, a file or a drawing is a plain folder (the Lab)
  if (!logo && !art) return <FileIcon file={SYSTEM_ICONS[id] ?? FOLDERS.plain} size={size} flat={flat} />;
  return (
    <div className={flat ? "" : "icon-wrap"} style={{ width: size, height: size }} aria-hidden>
      {logo ? (
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
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <path d="M14 6.5h25.5L52 19v37c0 1.4-1.1 2.5-2.5 2.5h-35A2.5 2.5 0 0 1 12 56V9c0-1.4 1.1-2.5 2.5-2.5z" fill="#fff" stroke="#000" strokeOpacity=".12" />
      <path d="M39.5 6.5V16c0 1.7 1.3 3 3 3H52" fill="#eef0f3" stroke="#000" strokeOpacity=".12" />
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
