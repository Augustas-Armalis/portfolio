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
