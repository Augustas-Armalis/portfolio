"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// One material for everything that floats over the 3D world: hover labels,
// the control bar, the player, "Put down" and "Land". Liquid Glass, done the
// way glass actually reads: almost no blur and no colour of its own, so what
// is behind stays recognisable; the edge bends that picture like a lens
// (an SVG displacement map shaped to the element, Chromium only); a bright
// specular rim, a soft inner shadow, and content that stays crisp on top.
// Safari and Firefox get the same piece without the refraction.

export const GLASS_SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 } as const;
export const GLASS_IN = { opacity: 0, y: 10, scale: 0.94 };
export const GLASS_ON = { opacity: 1, y: 0, scale: 1 };

const CSS = `
.lg{isolation:isolate;color:#fff;
  background:linear-gradient(180deg,rgb(255 255 255/.16),rgb(255 255 255/.04) 42%,rgb(255 255 255/.10)),rgb(14 18 22/.3);
  -webkit-backdrop-filter:blur(5px) saturate(1.45) brightness(1.03);backdrop-filter:blur(5px) saturate(1.45) brightness(1.03);
  box-shadow:inset 0 1px 0 rgb(255 255 255/.62),inset 0 -1px 0 rgb(255 255 255/.16),inset 1px 0 0 rgb(255 255 255/.12),inset -1px 0 0 rgb(255 255 255/.12),
    inset 0 0 16px rgb(255 255 255/.07),inset 0 -12px 20px -12px rgb(0 0 0/.26),inset 0 10px 14px -12px rgb(255 255 255/.22),
    0 14px 36px -12px rgb(0 0 0/.5),0 2px 6px -2px rgb(0 0 0/.28);
  text-shadow:0 1px 8px rgb(0 0 0/.32)}
.lg::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;
  background:conic-gradient(from 215deg,rgb(255 255 255/.85),rgb(255 255 255/.08) 22%,rgb(255 255 255/.5) 48%,rgb(255 255 255/.06) 74%,rgb(255 255 255/.85));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.lg::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:radial-gradient(90% 70% at 18% -18%,rgb(255 255 255/.26),transparent 62%),radial-gradient(70% 60% at 86% 118%,rgb(255 255 255/.12),transparent 60%)}
.lg-btn{border-radius:999px;transition:background-color .18s ease,color .18s ease,transform .18s cubic-bezier(.22,1,.36,1)}
.lg-btn:active{transform:scale(.96)}
@media (hover:hover){.lg-btn:hover{background-color:rgb(255 255 255/.16)}}
.lg-chip{background:rgb(255 255 255/.14);box-shadow:inset 0 1px 0 rgb(255 255 255/.28)}
.lg-on{background:rgb(255 255 255/.92);color:#0b0c0e;text-shadow:none;box-shadow:0 1px 6px rgb(0 0 0/.2)}
@media (hover:hover){.lg-on.lg-btn:hover{background-color:#fff}}
@media (prefers-reduced-transparency:reduce){.lg{background:rgb(28 32 36/.94);-webkit-backdrop-filter:none;backdrop-filter:none}}
`;

// The styles, once, wherever the scene shell mounts.
export function GlassStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
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

type GlassProps = Omit<HTMLMotionProps<"div">, "children"> & { radius?: number; lens?: boolean; children?: ReactNode };

export function Glass({ radius = 999, lens = true, className = "", style, children, ...rest }: GlassProps) {
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
  const bf = map ? `url(#${id}) blur(1.6px) saturate(1.45) brightness(1.03)` : undefined;
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
