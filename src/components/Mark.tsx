"use client";

import { useId } from "react";

// The mark of Augustas OS: a half-sun on the horizon. It is the small lit world the two kings hold in
// Karalių pasaka, and the line of light the loader opens on. One solid shape, one colour (currentColor).
// The same drawing is public/logo.svg; the boot screen draws it from the numbers in scene/shared.ts (BOOT).
export const MARK_PATH = "M15 36a17 17 0 0 1 34 0zM5.5 41.5h53a2.5 2.5 0 0 1 0 5h-53a2.5 2.5 0 0 1 0-5z";

// `size` is the height of the square the mark sits in; the drawing itself is cropped close, so it fills it.
export function Mark({ size = 16, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}

// The menu bar's mark: the same half-sun drawn again on the pixel grid for its one size, the way a system glyph is
// hinted. 24 by 12 points, every straight edge on a whole pixel at 1x and 2x: a sun of radius 8, a 2pt gap and a
// 2pt horizon with round ends that reaches 4pt past the sun on each side (the proportions of the large drawing).
// In a 24pt bar it sits 6pt from the top and bottom, the optical weight of the Apple menu glyph.
export function MenuMark({ className = "" }: { className?: string }) {
  return (
    <svg width={24} height={12} viewBox="0 0 24 12" className={`block shrink-0 ${className}`} aria-hidden shapeRendering="geometricPrecision">
      <path fill="currentColor" d="M4 8a8 8 0 0 1 16 0zM1 10h22a1 1 0 0 1 0 2H1a1 1 0 0 1 0-2z" />
    </svg>
  );
}

// The large mark (About, the account picture): the same drawing with depth instead of a flat stamp: ink that is
// lit from above and falls darker toward the horizon, a hairline of light along its top edge and a soft shadow
// under it, as if pressed into the glass it sits on.
export function MarkDeep({ size = 64, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" className={className} aria-hidden style={{ filter: "drop-shadow(0 0.5px 0 rgb(255 255 255 / 0.85)) drop-shadow(0 1px 1.5px rgb(16 18 24 / 0.22))" }}>
      <defs>
        <linearGradient id={`${id}-ink`} x1="0" y1="19" x2="0" y2="46.5" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4a4d55" />
          <stop offset="0.55" stopColor="#1f2126" />
          <stop offset="1" stopColor="#0b0c0e" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="19" x2="0" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}-ink)`} d={MARK_PATH} />
      {/* light caught on the sun's upper rim */}
      <path fill="none" stroke={`url(#${id}-rim)`} strokeWidth="0.9" d="M15.6 36a16.4 16.4 0 0 1 32.8 0" />
    </svg>
  );
}

// ---------- the system mark ----------
// In the menu bar and on the boot screen the mark is the Apple logo, without shipping Apple's artwork: it is the
// character U+F8FF, which the visitor's own system font draws as the Apple logo on a Mac, an iPhone or an iPad.
// Anywhere else that code point is empty (or another vendor's drawing), so those visitors get the half-sun.
// The glyph's ink is measured once on a canvas, so it can be set by its real height and centred by its real box
// (the way the menu bar's own glyph is), not by the font's line box.
const APPLE = "";
export const SYSTEM_FONT = '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
// ink box of the glyph per 1px of font size: above and below the baseline, left and right of the origin
type Ink = { ok: boolean; a: number; d: number; l: number; r: number };
let inkCache: Ink | null = null;
const NO_INK: Ink = { ok: false, a: 0, d: 0, l: 0, r: 0 };
export function appleInk(): Ink {
  if (inkCache) return inkCache;
  if (typeof document === "undefined") return NO_INK;
  inkCache = NO_INK;
  try {
    // Apple platforms only: other systems map U+F8FF to nothing, to a box, or to a different logo
    if (!/Macintosh|Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent)) return inkCache;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 72;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return inkCache;
    const draw = (ch: string) => {
      ctx.clearRect(0, 0, 72, 72);
      ctx.font = `48px ${SYSTEM_FONT}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000";
      ctx.fillText(ch, 12, 54);
      return ctx.getImageData(0, 0, 72, 72).data;
    };
    // it must draw something, and something other than what an unassigned neighbour draws (the missing-glyph box)
    const logo = draw(APPLE);
    const missing = draw("");
    let filled = 0;
    let differs = 0;
    for (let i = 3; i < logo.length; i += 4) {
      if (logo[i] > 128) filled++;
      if (Math.abs(logo[i] - missing[i]) > 64) differs++;
    }
    if (filled < 300 || differs < 120) return inkCache;
    ctx.font = `100px ${SYSTEM_FONT}`;
    const m = ctx.measureText(APPLE);
    const a = m.actualBoundingBoxAscent / 100;
    const d = m.actualBoundingBoxDescent / 100;
    const l = m.actualBoundingBoxLeft / 100;
    const r = m.actualBoundingBoxRight / 100;
    if (!(a + d > 0.5) || !(l + r > 0.4)) return inkCache;
    inkCache = { ok: true, a, d, l, r };
  } catch {
    // no canvas: the half-sun
  }
  return inkCache;
}

// The Apple logo glyph at an exact ink height, in a box that is exactly its ink (no line box, no side bearings).
export function AppleGlyph({ height, className = "", style }: { height: number; className?: string; style?: React.CSSProperties }) {
  const m = appleInk();
  const fs = height / (m.a + m.d);
  const w = (m.l + m.r) * fs;
  return (
    <svg width={w} height={height} viewBox={`${-m.l * fs} ${-m.a * fs} ${w} ${height}`} className={`block shrink-0 overflow-visible ${className}`} style={style} aria-hidden>
      <text x={0} y={0} fontSize={fs} fill="currentColor" style={{ fontFamily: SYSTEM_FONT, fontWeight: 400 }}>
        {APPLE}
      </text>
    </svg>
  );
}

// Menu bar: the logo's ink is 15pt tall in a 24pt bar, as on a Mac; it sits half a point high, where the eye puts
// the weight of the apple's body (the leaf is light). Without the glyph, the half-sun on its pixel grid.
export function SystemMenuMark({ className = "" }: { className?: string }) {
  if (appleInk().ok) return <AppleGlyph height={15} className={className} style={{ marginTop: -1 }} />;
  return <MenuMark className={className} />;
}

// Boot and restart: the logo 84pt tall, like a Mac starting up. `size` is the ink height.
export function SystemBootMark({ size = 84, className = "" }: { size?: number; className?: string }) {
  if (appleInk().ok) return <AppleGlyph height={size} className={className} />;
  return <Mark size={Math.round(size * 1.24)} className={className} />;
}

// The same glyph as pixels, for a surface that cannot set type (the 3D display's boot frame is a shader): white on
// clear, `height` px of ink tall, with a 2px margin. null where the glyph does not exist (draw the half-sun).
export function appleLogoCanvas(height: number): { canvas: HTMLCanvasElement; w: number; h: number; pad: number } | null {
  const m = appleInk();
  if (!m.ok) return null;
  const fs = height / (m.a + m.d);
  const pad = 2;
  const w = Math.ceil((m.l + m.r) * fs) + pad * 2;
  const h = Math.ceil(height) + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${fs}px ${SYSTEM_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.fillText(APPLE, pad + m.l * fs, pad + m.a * fs);
  return { canvas, w, h, pad };
}
