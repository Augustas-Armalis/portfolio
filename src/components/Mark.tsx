"use client";

import { useId } from "react";

// The mark of Augustas OS: one circle, one cut. The sun above the horizon and its reflection below it: the small
// lit world the two kings hold in Karalių pasaka, seen whole. One solid shape, one colour (currentColor), built
// from a disc of radius 28 at the centre of a 64 grid and a straight cut at the golden section.
// The same drawing is public/logo.svg; the tab icon and the app icons are drawn from it by
// qa-shots/os12/tools (marks.mjs, export.mjs), in gold.
export const MARK_PATH = "M4.889 39A28 28 0 1 1 59.111 39ZM6.251 43H57.749A28 28 0 0 1 6.251 43Z";
export const MARK_GOLD = ["#FFD466", "#F7931E"] as const;

// `size` is the height of the square the mark sits in; the drawing itself is cropped close, so it fills it.
export function Mark({ size = 16, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}

// The menu bar's mark: the same circle drawn again on the pixel grid for its one size, the way a system glyph is
// hinted. 14 by 14 points, the cut one whole point tall on a whole row at 1x and 2x. In a 24pt bar it sits 5pt
// from the top and bottom, the optical weight of the Apple menu glyph.
export function MenuMark({ className = "" }: { className?: string }) {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" className={`block shrink-0 ${className}`} aria-hidden shapeRendering="geometricPrecision">
      <path fill="currentColor" d="M0.292 9A7 7 0 1 1 13.708 9ZM0.675 10H13.325A7 7 0 0 1 0.675 10Z" />
    </svg>
  );
}

// The large mark (About, the account picture): the same drawing in its own colour, one soft gradient from gold
// to amber. Flat: no glow, no rim.
export function MarkDeep({ size = 64, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="4" x2="0" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={MARK_GOLD[0]} />
          <stop offset="1" stopColor={MARK_GOLD[1]} />
        </linearGradient>
      </defs>
      <path fill={`url(#${id}-g)`} d={MARK_PATH} />
    </svg>
  );
}

// ---------- the system mark ----------
// In the menu bar and on the boot screen the mark is the Apple logo, without shipping Apple's artwork: it is the
// character U+F8FF, which the visitor's own system font draws as the Apple logo on a Mac, an iPhone or an iPad.
// Anywhere else that code point is empty (or another vendor's drawing), so those visitors get his own mark.
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
    // no canvas: his own mark
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
// the weight of the apple's body (the leaf is light). Without the glyph, his own mark on its pixel grid.
export function SystemMenuMark({ className = "" }: { className?: string }) {
  if (appleInk().ok) return <AppleGlyph height={15} className={className} style={{ marginTop: -1 }} />;
  return <MenuMark className={className} />;
}

// Boot and restart: the logo 84pt tall, like a Mac starting up. `size` is the ink height.
export function SystemBootMark({ size = 84, className = "" }: { size?: number; className?: string }) {
  if (appleInk().ok) return <AppleGlyph height={size} className={className} />;
  return <Mark size={Math.round(size * 1.04)} className={className} />;
}

// The same glyph as pixels, for a surface that cannot set type (the 3D display's boot frame is a shader): white on
// clear, `height` px of ink tall, with a 2px margin. null where the glyph does not exist (draw his own mark).
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
