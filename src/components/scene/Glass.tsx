"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuality } from "@/lib/quality";

// One material for everything that floats over the 3D world: hover labels,
// the flight's controls, every focus mode's bar, the player. Liquid Glass,
// done the way glass actually reads: clear, almost no blur and almost no
// colour of its own, so what is behind stays recognisable; the edge bends
// that picture like a lens (an SVG displacement map shaped to the element,
// Chromium only); one thin hairline of light on the rim that wanders slowly
// round it; no border, no inner shadow, no drop shadow. A press gives and
// springs back. There is exactly one of it: every piece of the scene's UI,
// small or large, is this same glass (same blur, same tint, same edge). Safari and Firefox get the same piece without the refraction.

// (a little under critical: a morph settles with one small breath past its mark)
export const GLASS_SPRING = { type: "spring", stiffness: 400, damping: 27, mass: 0.9 } as const;
export const GLASS_IN = { opacity: 0, y: 10, scale: 0.94 };
export const GLASS_ON = { opacity: 1, y: 0, scale: 1 };

const CSS = `
@property --lg-a{syntax:"<angle>";inherits:false;initial-value:205deg}
.lg{isolation:isolate;color:#fff;--lg-spring:linear(0,.33 5%,.78 12%,1.06 21%,1.13 28%,1.06 40%,.99 55%,1.005 72%,1);
  background:linear-gradient(180deg,rgb(255 255 255/.11),rgb(255 255 255/.015) 46%,rgb(255 255 255/.06)),rgb(16 20 26/.15);
  -webkit-backdrop-filter:blur(3px) saturate(1.7) brightness(1.06);backdrop-filter:blur(3px) saturate(1.7) brightness(1.06);
  box-shadow:0 0 0 .5px rgb(0 0 0/.16);
  text-shadow:0 1px 7px rgb(0 0 0/.36);transition:filter .5s cubic-bezier(.22,1,.36,1)}
.lg svg{filter:drop-shadow(0 1px 2.5px rgb(0 0 0/.3))}
.lg .lg-on svg{filter:none}
/* the rim: one hairline of light, brightest where the sky would catch it, wandering slowly round the edge */
.lg::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:conic-gradient(from var(--lg-a),rgb(255 255 255/.95),rgb(255 255 255/.12) 16%,rgb(255 255 255/.4) 46%,rgb(255 255 255/.05) 70%,rgb(255 255 255/.95));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;
  animation:lg-rim 11s ease-in-out infinite alternate}
@keyframes lg-rim{from{--lg-a:178deg}to{--lg-a:262deg}}
/* the sheen: a soft catch of light inside the top edge, nothing heavier */
.lg::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(90% 70% at 20% -22%,rgb(255 255 255/.2),transparent 62%),radial-gradient(70% 60% at 84% 122%,rgb(255 255 255/.08),transparent 60%)}
/* a press gives like a drop of water and springs back */
.lg-btn{border-radius:999px;transition:background-color .2s ease,color .2s ease,opacity .2s ease,transform .5s var(--lg-spring)}
.lg-btn:active{transform:scale(.9);transition:background-color .2s ease,color .2s ease,transform .09s ease-out}
@media (hover:hover){.lg-btn:hover{background-color:rgb(255 255 255/.14)}}
.lg-btn:focus-visible{outline:1.5px solid rgb(255 255 255/.9);outline-offset:1px}
.lg-chip{background:rgb(255 255 255/.12)}
/* what is switched on is a bright lens in the glass */
.lg-on{background:linear-gradient(180deg,rgb(255 255 255/.97),rgb(255 255 255/.84));color:#0b0c0e;text-shadow:none;box-shadow:0 0 0 .5px rgb(255 255 255/.7)}
@media (hover:hover){.lg-on.lg-btn:hover{background-color:#fff}}
/* a short name under the pointer, after a moment (never on touch) */
.lg-tip{position:relative}
@media (hover:hover){.lg-tip::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 10px);transform:translate(-50%,4px);white-space:nowrap;pointer-events:none;
  font-size:11.5px;font-weight:500;letter-spacing:-.005em;color:#fff;text-shadow:0 1px 8px rgb(0 0 0/.6),0 0 2px rgb(0 0 0/.35);opacity:0;transition:opacity .16s ease,transform .2s cubic-bezier(.22,1,.36,1)}
.lg-tip:hover::after,.lg-tip:focus-visible::after{opacity:.95;transform:translate(-50%,0);transition-delay:.45s}}
/* sliders in glass: a hairline track and a small bright bead */
.lg-range{-webkit-appearance:none;appearance:none;background:transparent;height:20px;cursor:pointer;min-width:0}
.lg-range::-webkit-slider-runnable-track{height:3px;border-radius:3px;background:var(--lg-track,rgb(255 255 255/.34))}
.lg-range::-moz-range-track{height:3px;border-radius:3px;background:var(--lg-track,rgb(255 255 255/.34))}
.lg-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;margin-top:-5.5px;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgb(0 0 0/.35);transition:transform .4s var(--lg-spring)}
.lg-range::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgb(0 0 0/.35)}
.lg-range:active::-webkit-slider-thumb{transform:scale(1.25)}
.lg-range:focus-visible{outline:1.5px solid rgb(255 255 255/.9);outline-offset:3px;border-radius:8px}
/* H (or the eye) hides every piece of glass over the world; it comes back the same way */
html[data-ui-hidden] .lg{filter:opacity(0)!important;pointer-events:none!important}
html[data-ui-hidden] .lg *{pointer-events:none!important}
html[data-ui-hidden] [data-chrome]{opacity:0!important;pointer-events:none!important}
[data-chrome]{transition:opacity .5s cubic-bezier(.22,1,.36,1)}
@media (prefers-reduced-motion:reduce){.lg::before{animation:none}.lg-btn,.lg-btn:active{transition:background-color .2s ease,color .2s ease}}
@media (prefers-reduced-transparency:reduce){.lg{background:rgb(28 32 36/.94);-webkit-backdrop-filter:none;backdrop-filter:none}}
`;

// The styles, once, wherever the scene shell mounts. With them, where there is no lens at all (the Low level
// draws straight to the screen), the sheet the picture is on: the same paper grain the lens gives everywhere else,
// as one still layer of fine noise over the view and under the controls. It costs nothing and never moves.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0.9 0.9 0.9 0 -0.85'/></filter><rect width='220' height='220' filter='url(#n)'/></svg>`,
)}")`;
export function GlassStyles({ sheet = true }: { sheet?: boolean }) {
  const q = useQuality();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {sheet && q.post === 0 && <div aria-hidden data-paper="" className="pointer-events-none absolute inset-0 z-[5]" style={{ backgroundImage: GRAIN, backgroundSize: "220px 220px", mixBlendMode: "soft-light", opacity: 0.55 }} />}
    </>
  );
}

let lensOk: boolean | null = null;
function canLens() {
  if (lensOk !== null) return lensOk;
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  lensOk = /Chrome\/\d+/.test(ua) && !/Mobile|Android/.test(ua) && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  return lensOk;
}

// Displacement map for a rounded rectangle: neutral in the middle, and along
// the bezel each pixel points back toward the inside, more steeply the closer
// it sits to the edge, like the rim of a thick lens.
function lensMap(w: number, h: number, r: number, bezel: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const hx = w / 2;
  const hy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hx;
      const py = y + 0.5 - hy;
      const qx = Math.abs(px) - (hx - r);
      const qy = Math.abs(py) - (hy - r);
      let nx = 0;
      let ny = 0;
      let d: number;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        d = l - r;
        nx = (qx / l) * Math.sign(px);
        ny = (qy / l) * Math.sign(py);
      } else if (qx > qy) {
        d = qx - r;
        nx = Math.sign(px);
      } else {
        d = qy - r;
        ny = Math.sign(py);
      }
      const t = Math.min(1, Math.max(0, 1 + d / bezel));
      const m = t * t * t;
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * m * 127;
      img.data[i + 1] = 128 - ny * m * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

// (`panel` is accepted and ignored: there is one glass, the same for a pill, a bar, a popover and the player)
type GlassProps = Omit<HTMLMotionProps<"div">, "children"> & { radius?: number; lens?: boolean; panel?: boolean; children?: ReactNode };

export function Glass({ radius = 999, lens = true, panel: _one, className = "", style, children, ...rest }: GlassProps) {
  void _one;
  const ref = useRef<HTMLDivElement>(null);
  const id = `lg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [map, setMap] = useState<{ url: string; w: number; h: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !lens || !canLens()) return;
    let lw = 0;
    let lh = 0;
    const build = () => {
      const w = Math.round(el.offsetWidth);
      const h = Math.round(el.offsetHeight);
      if (!w || !h || (w === lw && h === lh) || w * h > 260000) return;
      lw = w;
      lh = h;
      const r = Math.min(radius, w / 2, h / 2);
      const bezel = Math.max(5, Math.min(18, h * 0.36));
      setMap({ url: lensMap(w, h, r, bezel), w, h, scale: bezel * 2.4 });
    };
    build();
    const ro = new ResizeObserver(build);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lens, radius]);
  const bf = map ? `url(#${id}) blur(1.1px) saturate(1.7) brightness(1.06)` : undefined;
  return (
    <motion.div ref={ref} className={`lg relative ${className}`} style={{ borderRadius: radius, ...(bf ? { backdropFilter: bf } : null), ...style }} {...rest}>
      {map && (
        <svg width="0" height="0" className="pointer-events-none absolute" aria-hidden>
          <filter id={id} x="0" y="0" width={map.w} height={map.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map.url} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="m" />
            <feDisplacementMap in="SourceGraphic" in2="m" scale={map.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      {children}
    </motion.div>
  );
}
