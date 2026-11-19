"use client";

// Pieces more than one app uses: the story item, screenshot helpers, small hooks.

import { useCallback, useEffect, useRef, useState } from "react";
import { type AppId, type Project } from "@/content";
import { useOS } from "@/store";

export function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#F1F1F4] text-ink-3">{icon}</div>
      <div className="mt-1 text-[14px] font-semibold text-ink">{title}</div>
      <div className="max-w-[32ch] text-[12px] leading-relaxed text-ink-2">{body}</div>
    </div>
  );
}

// ---------- App Store "Today": story cards that open into full stories ----------

export type StoryItem = { key: string; p: Project; app?: AppId; eyebrow: string; status?: string; action?: { label: string; run: () => void } };

// Real imagery for projects without a screenshot of their own: one of the OS wallpapers, with the app's icon on it
const STORY_ART: Record<string, string> = {
  lunor: "/wallpapers/founder-foggy-sunrise.webp",
  contles: "/wallpapers/founder-farnaz-kohankhaki.webp",
  filzy: "/wallpapers/art-bernd-dittrich.webp",
  rug: "/wallpapers/founder-mountain-glow.webp",
  slideskipper: "/wallpapers/art-thom-milkovic.webp",
  musicengine: "/wallpapers/art-tinky-rain-blue.webp",
  reel: "/wallpapers/art-satyajit-rain.webp",
  openwhip: "/wallpapers/founder-mountain-sunset.webp",
  doom: "/wallpapers/founder-uran-wang.webp",
};

// screenshots whose lower part is empty page: show only the top share
export const CROP: Record<string, number> = { "/img/work-kaching.webp": 0.6 };

export function ShotImg({ src, alt, className = "", ...rest }: { src: string; alt: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const crop = CROP[src];
  return (
    <div className={`overflow-hidden ${className}`} style={{ aspectRatio: crop ? `16 / ${10 * crop}` : "16 / 10" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} {...rest} className={crop ? "block h-auto w-full" : "block h-full w-full object-cover object-top"} />
    </div>
  );
}

export const storyImage = (it: StoryItem) => it.p.image ?? STORY_ART[it.key] ?? "/wallpapers/founder-uran-wang.webp";

// a screenshot of a light UI needs a deeper scrim than a photo
export const isShot = (it: StoryItem) => !!it.p.image;

// Behind a screenshot: a wallpaper photo, so the title sits on picture, not on UI text
export const SHOT_BG: Record<string, string> = {
  sellify: "/wallpapers/founder-mountain-glow.webp",
  kaching: "/wallpapers/art-tinky-rain-blue.webp",
  larpo: "/wallpapers/founder-uran-wang.webp",
  capto: "/wallpapers/founder-mountain-sunset.webp",
};

export type Photo = { title: string; src: string };

// Opens an app as a window on the desktop, or as a sheet on the phone.
export function useOpenApp(id: AppId) {
  const open = useOS((s) => s.open);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const isMobile = useOS((s) => s.isMobile);
  return useCallback(() => (isMobile ? openPhoneApp(id) : open(id)), [id, isMobile, open, openPhoneApp]);
}

// ---------- Get in Touch ----------

export const XMark = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2z" />
  </svg>
);

export function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setCopied(null), 1600);
  };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return { copied, copy };
}
