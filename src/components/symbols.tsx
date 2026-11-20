"use client";

// Symbols: every small interface glyph in the OS goes through here, so the whole system wears one family at one
// set of weights, the way SF Symbols does.
//
//  - One library: Lucide (24 grid, round caps and joins). Nothing is hand-drawn. The few glyphs that need a fill
//    Lucide does not ship (a note with a solid head, a filled tab-bar symbol with its details cut out) are built
//    from Lucide's own nodes, listed in PARTS below.
//  - Weight is the stroke as it is actually drawn, in CSS pixels, not a number on the 24 grid: a 13 px glyph at
//    Lucide's default "2" draws a 1.08 px hairline, which is what made the interface look thin. The table is the
//    stroke at 16 px; it grows with size a little slower than the glyph does (optical sizing), so a 12 px chevron
//    is not a hair and a 28 px one is not a slab.
//  - Outline is the resting state. `fill` is the selected or active state (a tab, a transport control).
//
// Weight by context (keep to this):
//   regular   beside body text: sidebar rows, menu items, list rows, the path bar
//   medium    toolbars, window chrome, the menu bar, buttons with a medium or semibold label, glyphs on tiles
//   semibold  navigation chevrons, close buttons, a phone's back arrow
//   bold      check marks, the tiny clear button

import { useId, type CSSProperties, type SVGProps } from "react";
import type { LucideIcon } from "lucide-react";

export type SymWeight = "light" | "regular" | "medium" | "semibold" | "bold";
const AT16: Record<SymWeight, number> = { light: 1.25, regular: 1.5, medium: 1.7, semibold: 1.95, bold: 2.3 };

/** The stroke drawn for a glyph of this size and weight, in px. */
export const symStroke = (size: number, weight: SymWeight = "regular") => Math.round(AT16[weight] * Math.pow(size / 16, 0.7) * 100) / 100;

type Node = [tag: "path" | "circle" | "rect" | "line", attrs: Record<string, string | number>];
// A glyph in parts: `body` takes the fill, `cut` is carved out of it (or drawn as a line when not filled),
// `solid` is always filled (a note's head).
type Parts = { body?: Node[]; cut?: Node[]; solid?: Node[] };

// Lucide's own geometry (ISC), split into the parts a fill needs.
const SPEAKER = "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z";
const PARTS = {
  // music-2: SF's music.note has a solid head
  note: {
    solid: [["circle", { cx: 8, cy: 18, r: 3.6 }]],
    cut: [["path", { d: "M12 18V2l7 4" }]],
  },
  // gamepad-2
  gamepad: {
    body: [["path", { d: "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" }]],
    cut: [
      ["line", { x1: 6, x2: 10, y1: 11, y2: 11 }],
      ["line", { x1: 8, x2: 8, y1: 9, y2: 13 }],
      ["line", { x1: 15, x2: 15.01, y1: 12, y2: 12 }],
      ["line", { x1: 18, x2: 18.01, y1: 10, y2: 10 }],
    ],
  },
  // image
  photo: {
    body: [["rect", { width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 }]],
    cut: [
      ["circle", { cx: 9, cy: 9, r: 2 }],
      ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
    ],
  },
  // file-text
  doc: {
    body: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }]],
    cut: [
      ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
      ["path", { d: "M10 9H8" }],
      ["path", { d: "M16 13H8" }],
      ["path", { d: "M16 17H8" }],
    ],
  },
  // folder
  folder: {
    body: [["path", { d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" }]],
  },
  // volume-2, volume-1, volume-x: SF's speaker is solid, its waves are lines
  speaker2: {
    solid: [["path", { d: SPEAKER }]],
    cut: [["path", { d: "M16 9a5 5 0 0 1 0 6" }], ["path", { d: "M19.364 18.364a9 9 0 0 0 0-12.728" }]],
  },
  speaker1: {
    solid: [["path", { d: SPEAKER }]],
    cut: [["path", { d: "M16 9a5 5 0 0 1 0 6" }]],
  },
  speakerOff: {
    solid: [["path", { d: SPEAKER }]],
    cut: [
      ["line", { x1: 22, x2: 16, y1: 9, y2: 15 }],
      ["line", { x1: 16, x2: 22, y1: 9, y2: 15 }],
    ],
  },
  // lock: a solid body under an open shackle
  lock: {
    solid: [["rect", { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }]],
    cut: [["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
  },
} satisfies Record<string, Parts>;
export type PartName = keyof typeof PARTS;

const draw = (nodes: Node[] | undefined, extra?: SVGProps<SVGElement>) =>
  nodes?.map(([Tag, a], i) => {
    const El = Tag as "path";
    return <El key={i} {...(a as SVGProps<SVGPathElement>)} {...(extra as SVGProps<SVGPathElement>)} />;
  });

export type SymIcon = LucideIcon | PartName;
type SymProps = {
  /** a Lucide icon, or the name of a glyph in parts */
  icon: LucideIcon | PartName;
  size?: number;
  weight?: SymWeight;
  /** the selected or active state: the glyph filled, its details cut out */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Sym({ icon, size = 16, weight = "regular", fill = false, className = "", style }: SymProps) {
  const px = symStroke(size, weight);
  // the stroke on the 24 grid that draws `px` on screen
  const sw = (px * 24) / size;
  const uid = useId();
  if (typeof icon !== "string") {
    const Icon = icon;
    return <Icon size={size} aria-hidden className={`sym shrink-0 ${className}`} fill={fill ? "currentColor" : "none"} style={{ strokeWidth: sw, ...style }} />;
  }
  const p: Parts = PARTS[icon];
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: `sym shrink-0 ${className}`, style };
  if (fill && p.body && p.cut) {
    const id = `sym${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
      <svg {...common}>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <g fill="#fff" stroke="#fff">
            {draw(p.body)}
          </g>
          {/* the details, cut a touch wider than they are drawn so they stay open at 16 px */}
          <g fill="none" stroke="#000" strokeWidth={sw * 1.08}>
            {draw(p.cut)}
          </g>
        </mask>
        <rect width="24" height="24" fill="currentColor" stroke="none" mask={`url(#${id})`} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {draw(p.body, fill ? { fill: "currentColor" } : undefined)}
      {draw(p.solid, { fill: "currentColor" })}
      {draw(p.cut)}
    </svg>
  );
}
