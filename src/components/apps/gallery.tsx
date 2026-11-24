"use client";

// Photos: one app for his photographs, his films and his design shots, opened as the Gallery (on the Library) or as
// Shots (on the Design shots album). On the Mac it is macOS Photos: a sidebar of the Library, the albums and the
// media types, a grid whose size the toolbar's − and + (or a pinch on the trackpad) change, and Quick Look over it
// (arrows, Space or Esc, a double click to zoom). On the phone it is iOS Photos: Library and Albums at the top, a
// grid to the edges that two fingers pinch denser or larger, an album a screen of its own, and a full-screen viewer
// that swipes between pictures, pinches and double-taps to zoom and is pulled down to put away.
// The Library is his own work by month, from the day each was taken. Every picture blurs up from a tiny copy, the
// viewer loads its own size with the neighbours either side, and the largest copy only when zoomed in.

import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls } from "motion/react";
import { flushSync } from "react-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Drone, Film, Image as ImageIcon, Images, Minus, Play, Plus, X } from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { gallery, shots, type Album, type Media } from "@/content";
import { useOS } from "@/store";
import { Sym } from "../symbols";
import { Btn, List, ListRow, M, PhoneNav, reducedMotion, SectionHeader, Segmented, SplitFrame, Toolbar, useChrome, usePhoneBack } from "../ui";
import { XMark } from "./shared";

// a design shot is a picture too, from his X account; it keeps its 16:10 shape in the grid
type Item = Media & { shot?: boolean };
const shotItems: Item[] = shots.items.map((s) => ({
  id: `shot-${s.src.replace(/^.*shot-|\.webp$/g, "")}`,
  kind: "photo",
  title: s.title,
  src: s.src,
  thumb: s.src,
  credit: { by: shots.handle, href: shots.href, site: "X" },
  shot: true,
}));
const byId = new Map(gallery.media.map((m) => [m.id, m]));
const itemsOf = (a: Album) => a.items.map((id) => byId.get(id)).filter((m): m is Media => !!m);
// a set to look through: the Library, one of the albums, or everything of one kind
type Collection = { id: string; title: string; sub: string; items: Item[]; wide?: boolean; icon?: typeof Film };
const own = gallery.media.filter((m) => m.own);
const LIBRARY: Collection = { id: "library", title: "Library", sub: "", items: own.length ? own : gallery.media, icon: Images };
const SHOTS: Collection = { id: "shots", title: "Design shots", sub: "Interface work, posted on X", items: shotItems, wide: true };
const albumSets: Collection[] = (() => {
  const sets = gallery.albums.map((a): Collection => ({ id: a.id, title: a.title, sub: a.sub, items: itemsOf(a) }));
  // his own first, the design shots next, then the rest
  sets.splice(sets.findIndex((s) => s.id === "mine") + 1, 0, SHOTS);
  return sets;
})();
const typeSets: Collection[] = [
  { id: "videos", title: "Videos", sub: "Every film", icon: Film, items: gallery.media.filter((m) => m.kind === "video") },
  { id: "drone", title: "Drone", sub: "From the air", icon: Drone, items: gallery.media.filter((m) => m.drone) },
  { id: "photos", title: "Photos", sub: "Every photograph", icon: ImageIcon, items: gallery.media.filter((m) => m.kind === "photo") },
];
const ALL = [LIBRARY, ...albumSets, ...typeSets];
const setById = (id: string) => ALL.find((s) => s.id === id) ?? LIBRARY;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// a tiny copy of the same picture, shown blurred while the full one loads: his own carry one inline (24 px), the
// Unsplash ones are asked for at 48 px; a design shot has none (its tile shimmers until it is in)
const lowRes = (m: Item) => m.placeholder ?? (m.shot ? undefined : m.kind === "photo" ? m.src.replace(/w=\d+/, "w=48") : m.poster);
const dayOf = (iso?: string) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
const monthOf = (iso: string) => new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const countOf = (items: Item[]) => {
  const v = items.filter((m) => m.kind === "video").length;
  const p = items.length - v;
  return [p && plural(p, items.every((m) => m.shot) ? "shot" : "photo"), v && plural(v, "film")].filter(Boolean).join(", ");
};
// the Library: everything newest first, by the day each was taken
const LIBRARY_RUN = [...LIBRARY.items].sort((a, b) => ((a.date ?? "") < (b.date ?? "") ? 1 : (a.date ?? "") > (b.date ?? "") ? -1 : 0));
const spanOf = (items: Item[]) => {
  // only when every one of them carries its day
  const ys = items.map((m) => m.date?.slice(0, 4)).filter(Boolean).sort();
  return ys.length && ys.length === items.length ? (ys[0] === ys[ys.length - 1] ? ys[0]! : `${ys[0]}–${ys[ys.length - 1]}`) : "";
};

// how dense the grid is: the phone in columns (a pinch steps through them), the Mac in the smallest a tile may be
const PHONE_COLS = { square: [1, 3, 5], wide: [1, 2, 3] };
const MAC_SIZES = [96, 140, 200, 300];

function Tile({ m, onOpen, wide, feature }: { m: Item; onOpen: (el: HTMLElement) => void; wide?: boolean; feature?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      data-mid={m.id}
      data-date={m.date}
      aria-label={m.kind === "video" ? `${m.title}, film, ${clock(m.duration ?? 0)}` : m.title}
      className={`group relative block overflow-hidden bg-[var(--fill-2)] bg-cover bg-center outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${wide ? "aspect-[16/10]" : "aspect-square"} ${feature ? "col-span-2 row-span-2" : ""} ${lowRes(m) ? "" : "skeleton"}`}
      // the tile is the tiny copy, blurred by the scale-up, until the picture is in: nothing jumps when it arrives
      style={m.placeholder ? { backgroundImage: `url(${m.placeholder})` } : undefined}
    >
      {m.kind === "video" ? <TilePreview m={m} /> : <TileImage src={m.thumb} />}
      {m.kind === "video" && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold tabular-nums text-white">
          {feature && <span className="mr-auto truncate pr-2 text-left text-[13px] font-semibold">{m.title}</span>}
          <Sym icon={Play} size={10} fill />
          {clock(m.duration ?? 0)}
        </span>
      )}
      {m.shot && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 hov:group-hover:opacity-100">
          {m.title}
        </span>
      )}
    </button>
  );
}

// a picture fades in once it has arrived instead of drawing in strips
function TileImage({ src }: { src: string }) {
  const [on, setOn] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onLoad={() => setOn(true)} ref={(el) => void (el?.complete && el.naturalWidth && !on && setOn(true))} className={`h-full w-full object-cover transition-[opacity,filter] duration-300 hov:group-hover:brightness-[1.06] ${on ? "opacity-100" : "opacity-0"}`} />
  );
}

// A film in the grid plays by itself, silent and looping, while it is in sight (and stops when it is not), as
// Photos does. Not for a visitor who asks for less motion or to save data: they see its first frame.
function TilePreview({ m }: { m: Item }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!v || reducedMotion() || saveData) return;
    v.muted = true;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting && document.visibilityState === "visible" ? v.play().catch(() => {}) : v.pause()), { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  // his own films loop a small silent cut of themselves (about half a megabyte); the film itself loads only when opened
  return <video ref={ref} src={m.preview ?? m.src} poster={m.thumb} muted loop playsInline preload="none" disablePictureInPicture className="h-full w-full object-cover" aria-hidden />;
}

// The grid, edge to edge with hairline gaps: the phone in columns, the Mac in tiles of at least a size
function Grid({ items, open, wide, cols, size }: { items: Item[]; open: (i: number, el: HTMLElement) => void; wide?: boolean; cols?: number; size?: number }) {
  const many = cols ? cols >= 3 : true;
  return (
    <div
      style={{ gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${wide ? Math.round((size ?? 140) * 1.6) : size}px, 1fr))` }}
      className="grid grid-flow-dense gap-[2px]"
    >
      {items.map((m, i) => (
        // his own film is a large tile where there is room for one
        <Tile key={m.id} m={m} wide={wide} feature={!wide && many && m.own && m.kind === "video"} onOpen={(el) => open(i, el)} />
      ))}
    </div>
  );
}

// One picture or film in the viewer. Only the one in view plays: its neighbours wait as their posters.
// A film in the viewer. The stock ones start muted at once; his own starts with its sound where the browser allows it
// (the tap that opened it counts), muted otherwise. Any of them stops when the tab is hidden, and goes with the viewer.
function FilmPlayer({ m }: { m: Item }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (m.own) v.play().catch(() => ((v.muted = true), v.play().catch(() => {})));
    const hide = () => document.visibilityState !== "visible" && v.pause();
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [m.own]);
  return <video ref={ref} src={m.src} poster={m.poster} controls autoPlay={!m.own} muted={!m.own} playsInline className="max-h-full max-w-full rounded-[10px] bg-black object-contain" />;
}

function Slide({ m, current, loaded, onLoad, zoomed = false }: { m: Item; current: boolean; loaded: boolean; onLoad: () => void; zoomed?: boolean }) {
  // zoomed in on one of his own: the full-size copy is fetched, and swapped in once it has arrived
  const [sharp, setSharp] = useState<string | null>(null);
  useEffect(() => {
    if (!zoomed || !m.zoom || sharp) return;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => setSharp(m.zoom!);
    img.src = m.zoom;
  }, [zoomed, m.zoom, sharp]);
  if (m.kind === "video" && current) return <FilmPlayer m={m} />;
  const src = m.kind === "video" ? m.poster : (sharp ?? m.src);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!loaded && m.kind === "photo" && lowRes(m) && <img src={lowRes(m)} alt="" aria-hidden className="absolute max-h-full max-w-full object-contain blur-xl" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={current ? m.title : ""} draggable={false} onLoad={onLoad} className={`relative max-h-full max-w-full select-none object-contain transition-opacity duration-300 ${loaded || m.kind === "video" ? "opacity-100" : "opacity-0"}`} />
    </>
  );
}

// The filmstrip under the viewer: every item small, the one in view lit and kept in the middle; a tap jumps to it.
function Strip({ list, index, pick, opacity }: { list: Item[]; index: number; pick: (i: number) => void; opacity: ReturnType<typeof useMotionValue<number>> }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = row.current;
    const el = r?.children[index] as HTMLElement | undefined;
    if (r && el) r.scrollTo({ left: el.offsetLeft - r.clientWidth / 2 + el.offsetWidth / 2, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [index]);
  return (
    <motion.div style={{ opacity }} className="relative shrink-0">
      <div ref={row} className="flex touch-pan-x gap-[3px] overflow-x-auto px-[50%] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-strip="">
        {list.map((it, i) => (
          <button key={it.id} type="button" onClick={() => pick(i)} aria-label={`Show ${it.title}`} aria-current={i === index} className={`relative h-11 w-8 shrink-0 overflow-hidden rounded-[4px] transition-[opacity,transform] duration-200 ${i === index ? "scale-110 opacity-100 ring-[1.5px] ring-white" : "opacity-55 hov:hover:opacity-85"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            {it.kind === "video" && <Sym icon={Play} size={8} fill className="absolute bottom-0.5 left-0.5 text-white" />}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

const GAP = 16;
// The viewer: the picture in view with its neighbours either side, on one strip that follows the finger. Let go
// past a quarter of the width (or with a flick) and the next one slides in; a pull down puts it away. The strip
// can be caught again while it is still moving.
function Viewer({ list, index, setIndex, close: put, label, originOf }: { list: Item[]; index: number; setIndex: (i: number) => void; close: () => void; label?: string; originOf: (id: string) => { x: number; y: number } | null }) {
  const { compact } = useChrome();
  // it grows out of the tile it was opened from, and shrinks back into the tile of the one in view when put away
  const [origin, setOrigin] = useState(() => originOf(list[index].id));
  const close = () => {
    flushSync(() => setOrigin(originOf(list[index].id)));
    put();
  };
  const m = list[index];
  const many = list.length > 1;
  const wrap = (i: number) => (i + list.length) % list.length;
  const stage = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const pending = useRef(0);
  const [loaded, setLoaded] = useState<Record<string, true>>({});
  const bg = useTransform(y, [0, 320], [1, 0]);
  const shrink = useTransform(y, [0, 500], [1, 0.82]);
  const width = () => (stage.current?.clientWidth ?? window.innerWidth) + GAP;
  const land = () => {
    const d = pending.current;
    pending.current = 0;
    if (!d) return;
    flushSync(() => setIndex(wrap(index + d)));
    x.set(x.get() + d * width());
  };
  // which slide is the latest: a landing scheduled by an older one that was caught mid-way does nothing
  const tok = useRef(0);
  const go = (d: number, velocity = 0) => {
    anim.current?.stop();
    land();
    const t = ++tok.current;
    if (!many || !d) {
      anim.current = animate(x, 0, { ...M.fling, velocity });
      return;
    }
    pending.current = d;
    // landed a frame later: the animation writes its last value after onComplete, which would undo the reset
    anim.current = animate(x, -d * width(), { type: "spring", bounce: 0, duration: 0.34, velocity, onComplete: () => requestAnimationFrame(() => tok.current === t && land()) });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Quick Look: Space puts it away too (but plays and pauses a film that has the focus)
      if (e.key === " " && !compact && (e.target as HTMLElement).tagName !== "VIDEO") {
        e.preventDefault();
        close();
      }
      if (many && e.key === "ArrowRight") go(1);
      if (many && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // the next two either way are fetched ahead (the ones either side are already on the strip), so a run of swipes
  // never waits
  useEffect(() => {
    for (const d of [2, -2]) {
      const it = list[(index + d + list.length) % list.length];
      if (list.length > 3 && it.kind === "photo") new Image().src = it.src;
    }
  }, [index, list]);
  // a swipe in from the left edge of the phone puts it away too
  usePhoneBack(true, close);
  // on the phone the viewer is black to the top edge: the status bar turns white over it
  useEffect(() => {
    if (!compact) return;
    useOS.getState().setHeroDark(true);
    return () => useOS.getState().setHeroDark(false);
  }, [compact]);

  // Zoom, on a photograph: a double tap (or a double click) goes in where it lands and back out; two fingers pinch
  // and move it; zoomed in, one finger moves it about instead of turning the page. Another picture starts unzoomed.
  const zoomable = m.kind === "photo";
  const z = useMotionValue(1);
  const zx = useMotionValue(0);
  const zy = useMotionValue(0);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number; mx: number; my: number; px: number; py: number } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  useEffect(() => {
    z.set(1);
    zx.set(0);
    zy.set(0);
  }, [index, z, zx, zy]);
  const clampPan = (k: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const mx = ((k - 1) * r.width) / 2;
    const my = ((k - 1) * r.height) / 2;
    zx.set(Math.max(-mx, Math.min(mx, zx.get())));
    zy.set(Math.max(-my, Math.min(my, zy.get())));
  };
  // past 1.3x the sharper copy is worth fetching
  const [zoomed, setZoomed] = useState(false);
  useMotionValueEvent(z, "change", (v) => v > 1.3 && setZoomed(true));
  useEffect(() => setZoomed(false), [index]);
  const zoomAt = (cx: number, cy: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r || !zoomable) return;
    if (z.get() > 1.01) {
      animate(z, 1, M.ui);
      animate(zx, 0, M.ui);
      animate(zy, 0, M.ui);
      return;
    }
    const k = 2.5;
    const mx = ((k - 1) * r.width) / 2;
    const my = ((k - 1) * r.height) / 2;
    animate(z, k, M.ui);
    animate(zx, Math.max(-mx, Math.min(mx, (r.left + r.width / 2 - cx) * (k - 1))), M.ui);
    animate(zy, Math.max(-my, Math.min(my, (r.top + r.height / 2 - cy) * (k - 1))), M.ui);
  };

  const g = useRef<{ id: number; x0: number; y0: number; bx: number; by: number; axis: "x" | "y" | "pan" | null; hist: { x: number; y: number; t: number }[] } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && !compact) return;
    // the film's own controls keep their touches
    const t = e.target as HTMLElement;
    if (t.tagName === "VIDEO" && e.clientY > t.getBoundingClientRect().bottom - 64) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2 && zoomable) {
      // a second finger: a pinch, whatever the first one was doing
      const [a, b] = [...pts.current.values()];
      if (g.current?.axis === "x") animate(x, 0, M.fling);
      if (g.current?.axis === "y") animate(y, 0, M.fling);
      g.current = null;
      pinch.current = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z.get(), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, px: zx.get(), py: zy.get() };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // the stage fills the screen
      }
      return;
    }
    if (g.current) return;
    anim.current?.stop();
    tok.current++;
    land();
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, bx: z.get() > 1.01 ? zx.get() : x.get(), by: zy.get(), axis: null, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const k = Math.max(0.8, Math.min(5, (p.z0 * Math.hypot(a.x - b.x, a.y - b.y)) / p.d0));
      z.set(k);
      zx.set(p.px + ((a.x + b.x) / 2 - p.mx));
      zy.set(p.py + ((a.y + b.y) / 2 - p.my));
      return;
    }
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      s.axis = z.get() > 1.01 ? "pan" : Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // the stage fills the screen: the finger stays over it anyway
      }
    }
    s.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (s.hist.length > 5) s.hist.shift();
    if (s.axis === "pan") {
      zx.set(s.bx + dx);
      zy.set(s.by + dy);
      clampPan(z.get());
    }
    // past the first or last there is nothing more: it gives, but only a little
    else if (s.axis === "x") x.set(s.bx + (many ? dx : dx * 0.3));
    else y.set(dy > 0 ? dy : dy * 0.2);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    if (pinch.current) {
      if (pts.current.size < 2) {
        pinch.current = null;
        // let go small: back to the whole picture; otherwise held where it is, inside its edges
        const k = z.get();
        if (k < 1.05) {
          animate(z, 1, M.fling);
          animate(zx, 0, M.fling);
          animate(zy, 0, M.fling);
        } else if (k > 4) animate(z, 4, M.fling);
        else clampPan(k);
      }
      return;
    }
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (!s.axis) {
      // two taps close together in time and place: zoom there
      const l = lastTap.current;
      if (e.type === "pointerup" && l && e.timeStamp - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 30) {
        lastTap.current = null;
        zoomAt(e.clientX, e.clientY);
      } else lastTap.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      return;
    }
    if (s.axis === "pan") return;
    const a = s.hist[0];
    const b = s.hist[s.hist.length - 1];
    const dt = Math.max(1, b.t - a.t);
    const cancel = e.type === "pointercancel";
    if (s.axis === "x") {
      const vx = cancel ? 0 : ((b.x - a.x) / dt) * 1000;
      const off = x.get();
      const w = width();
      go(off < -w * 0.25 || vx < -450 ? 1 : off > w * 0.25 || vx > 450 ? -1 : 0, vx);
    } else {
      const vy = cancel ? 0 : ((b.y - a.y) / dt) * 1000;
      if (!cancel && (y.get() > 120 || vy > 700)) close();
      else animate(y, 0, { ...M.fling, velocity: vy });
    }
  };

  const slots = many ? [-1, 0, 1] : [0];
  return (
    <motion.div
      key="viewer"
      role="dialog"
      aria-label={m.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: M.out }}
      transition={M.fade}
      className={`${compact ? "fixed z-[2400]" : "absolute z-30"} inset-0 flex flex-col text-white`}
    >
      {/* black, with the picture's own colours glowing faintly behind it (its small copy, blurred once) */}
      <motion.div aria-hidden className="absolute inset-0 overflow-hidden bg-black" style={{ opacity: bg }}>
        <AnimatePresence initial={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <motion.img key={m.id} src={m.thumb} alt="" initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0 h-full w-full scale-125 object-cover blur-[60px] saturate-150" />
        </AnimatePresence>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.55))]" />
      </motion.div>
      <motion.div style={{ opacity: bg }} className={`relative flex shrink-0 items-center gap-3 px-4 ${compact ? "pt-[calc(var(--phone-top)+4px)]" : "pt-3"}`}>
        {/* on the Mac the window's traffic lights hold the top left: Close goes to the right */}
        <Btn variant="glass-dark" capsule iconOnly size="md" label="Close" onClick={close} icon={<Sym icon={X} size={17} weight="semibold" />} className={`!h-10 !w-10 ${compact ? "" : "order-last"}`} />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold">{m.title}</div>
          {many && <div className="text-[12px] tabular-nums text-white/55">{label ? `${label} · ${index + 1} of ${list.length}` : `${index + 1} of ${list.length}`}</div>}
        </div>
        <span className="w-10" />
      </motion.div>
      <div ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={(e) => !compact && zoomAt(e.clientX, e.clientY)} className={`relative min-h-0 flex-1 touch-none overflow-hidden ${zoomable && !compact ? "cursor-zoom-in" : ""}`} data-viewer-stage="">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.4, transition: { ...M.ui, duration: 0.3 } }}
          transition={M.ui}
          style={{ transformOrigin: origin ? `${origin.x}px ${origin.y - (stage.current?.offsetTop ?? (compact ? 60 : 52))}px` : "50% 50%" }}
        >
        <motion.div className="absolute inset-0" style={{ x, y, scale: shrink }}>
          {slots.map((d) => {
            const it = list[wrap(index + d)];
            return (
              <div key={it.id + (many && list.length < 3 && d ? `:${d}` : "")} className="absolute inset-0 flex items-center justify-center px-2 py-3" style={{ transform: `translateX(calc(${d * 100}% + ${d * GAP}px))` }} aria-hidden={d !== 0}>
                {d === 0 ? (
                  <motion.div className="flex h-full w-full items-center justify-center" style={{ scale: z, x: zx, y: zy }}>
                    <Slide m={it} current zoomed={zoomed} loaded={!!loaded[it.id]} onLoad={() => setLoaded((l) => (l[it.id] ? l : { ...l, [it.id]: true }))} />
                  </motion.div>
                ) : (
                  <Slide m={it} current={false} loaded={!!loaded[it.id]} onLoad={() => setLoaded((l) => (l[it.id] ? l : { ...l, [it.id]: true }))} />
                )}
              </div>
            );
          })}
        </motion.div>
        </motion.div>
        {many && !compact && (
          <>
            <Btn variant="glass-dark" capsule iconOnly size="md" label="Previous" onClick={() => go(-1)} icon={<Sym icon={ChevronLeft} size={20} weight="semibold" />} className="!absolute left-4 top-1/2 !h-11 !w-11 -translate-y-1/2" />
            <Btn variant="glass-dark" capsule iconOnly size="md" label="Next" onClick={() => go(1)} icon={<Sym icon={ChevronRight} size={20} weight="semibold" />} className="!absolute right-4 top-1/2 !h-11 !w-11 -translate-y-1/2" />
          </>
        )}
      </div>
      {many && <Strip list={list} index={index} pick={(i) => (anim.current?.stop(), tok.current++, (pending.current = 0), x.set(0), setIndex(i))} opacity={bg} />}
      <motion.div style={{ opacity: bg }} className={`relative shrink-0 px-4 pt-2 text-center text-[12px] text-white/50 ${compact ? "pb-[calc(var(--phone-bottom)+8px)]" : "pb-3"}`}>
        {m.own ? (
          // his own: the day it was taken
          <span className="tabular-nums text-white/70">{dayOf(m.date)}</span>
        ) : m.shot ? (
          // a design shot: where it was posted
          <a href={m.credit.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-white/75 hover:text-white">
            Posted on X as {m.credit.by}
            <Sym icon={ArrowUpRight} size={11} weight="medium" />
          </a>
        ) : (
          <>
            {m.kind === "video" ? "Film" : "Photo"} by{" "}
            <a href={m.credit.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-white/75 hover:text-white">
              {m.credit.by}
              {m.credit.by !== m.credit.site && ` on ${m.credit.site}`}
              <Sym icon={ArrowUpRight} size={11} weight="medium" />
            </a>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// Two fingers on the phone's grid: spread them and the tiles grow (fewer across), pinch and they shrink, one step per
// gesture, as in iOS Photos. One finger still scrolls; the step is made from where the fingers were.
function usePinchSteps(step: (dir: 1 | -1, x: number, y: number) => void) {
  const g = useRef<{ d0: number; done: boolean } | null>(null);
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      if (e.touches.length === 2) g.current = { d0: dist(e.touches) || 1, done: false };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const s = g.current;
      if (!s || s.done || e.touches.length < 2) return;
      const k = dist(e.touches) / s.d0;
      if (k > 1.22 || k < 0.82) {
        s.done = true;
        step(k > 1 ? 1 : -1, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (e.touches.length < 2) g.current = null;
    },
  };
}

type View = { list: Item[]; index: number; label: string };
type From = { k: number; x: string; y: string } | null;

export function Photos({ start = "library" }: { start?: "library" | "shots" }) {
  const { compact } = useChrome();
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // the phone: Library or Albums, and an album opened over Albums. The Mac: what the sidebar has chosen.
  const [tab, setTab] = useState<"library" | "albums">(start === "shots" ? "albums" : "library");
  const [opened, setOpened] = useState<string | null>(start === "shots" ? "shots" : null);
  const [picked, setPicked] = useState<string>(start);
  const [side, setSide] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const shown = compact ? (tab === "albums" && opened ? setById(opened) : tab === "library" ? LIBRARY : null) : setById(picked);
  const wide = !!shown?.wide;

  // density: a step along the phone's columns or the Mac's tile sizes; the change grows in from where it was made
  const [steps, setSteps] = useState({ square: 1, wide: 1, mac: 1 });
  const [from, setFrom] = useState<From>(null);
  const cols = compact ? PHONE_COLS[wide ? "wide" : "square"][wide ? steps.wide : steps.square] : undefined;
  const size = compact ? undefined : MAC_SIZES[steps.mac];
  const change = useCallback(
    (dir: 1 | -1, x?: number, y?: number) => {
      const key = compact ? (wide ? "wide" : "square") : "mac";
      const scale = compact ? PHONE_COLS[wide ? "wide" : "square"] : MAC_SIZES;
      setSteps((s) => {
        // the phone's columns run from large to small: spreading the fingers is a step back along them
        const next = compact ? s[key] - dir : s[key] + dir;
        if (next < 0 || next >= scale.length) return s;
        const a = scale[s[key]];
        const b = scale[next];
        const box = (compact ? root.current : scroller.current)?.getBoundingClientRect();
        const top = compact ? 0 : (scroller.current?.scrollTop ?? 0);
        setFrom({
          k: compact ? b / a : a / b,
          x: box && x !== undefined ? `${x - box.left}px` : "50%",
          y: box && y !== undefined ? `${y - box.top + top}px` : `${top + (box?.height ?? 0) / 2}px`,
        });
        return { ...s, [key]: next };
      });
    },
    [compact, wide],
  );
  const pinch = usePinchSteps((dir, x, y) => change(dir, x, y));
  // the Mac: a pinch on the trackpad (a wheel with Ctrl) or ⌘ with the wheel changes the size too
  useEffect(() => {
    const el = scroller.current;
    if (compact || !el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) > 40) {
        change(acc < 0 ? 1 : -1, e.clientX, e.clientY);
        acc = 0;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [compact, change]);

  // the phone: an opened album is a screen of its own, named in the navigation bar, with Back (or the edge swipe)
  const nav = useContext(PhoneNav);
  const openedTitle = tab === "albums" && opened ? setById(opened).title : null;
  useEffect(() => {
    if (!compact || !nav) return;
    nav(openedTitle ? { title: openedTitle, back: () => setOpened(null) } : null);
    return () => nav(null);
  }, [compact, nav, openedTitle]);
  usePhoneBack(compact && !!openedTitle, () => setOpened(null));
  // a new screen starts at its top
  useEffect(() => {
    const el = compact ? root.current?.closest(".overflow-y-auto") : scroller.current;
    el?.scrollTo({ top: 0 });
    setFrom(null);
  }, [compact, tab, opened, picked]);

  // the viewer grows out of the tile it was opened from and goes back into the one it shows when put away
  const originOf = useCallback(
    (id: string) => {
      const el = root.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
      const host = root.current;
      if (!el || !host) return null;
      const r = el.getBoundingClientRect();
      const box = compact ? { left: 0, top: 0, height: window.innerHeight } : host.getBoundingClientRect();
      const y = r.top + r.height / 2 - box.top;
      // a tile scrolled out of sight: from the middle instead
      if (y < 0 || y > box.height) return null;
      return { x: r.left + r.width / 2 - box.left, y };
    },
    [compact],
  );
  const openAt = (set: Collection, list: Item[]) => (i: number) => setView({ list, index: i, label: set.title });

  const pad = compact ? "px-4" : "px-5";

  // The Library: a few words from him, then his work a month at a time
  const library = (
    <div className="pb-8">
      <p className={`${pad} max-w-[640px] pb-3 pt-2 text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "m-body pt-4"}`}>{gallery.intro}</p>
      <div className="relative">
        <DateLabel compact={compact} />
        <Grid items={LIBRARY_RUN} cols={cols} size={size} open={openAt(LIBRARY, LIBRARY_RUN)} />
      </div>
    </div>
  );

  // An album, or a media type: what is in it, then the grid
  const album = (set: Collection) => (
    <div className="pb-8">
      <div className={`${pad} flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 ${compact ? "pt-0" : "pt-4"}`}>
        <p className={`min-w-0 flex-1 tabular-nums text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{/* the Mac's toolbar already counts them */}
          {[set.sub, compact && countOf(set.items), spanOf(set.items)].filter(Boolean).join(" · ")}</p>
        {set.id === "shots" && compact && (
          <Btn size="sm" href={shots.href} label={`Open ${shots.handle} on X`} icon={<XMark size={12} />}>
            {shots.handle}
          </Btn>
        )}
      </div>
      <Grid items={set.items} wide={set.wide} cols={cols} size={size} open={openAt(set, set.items)} />
    </div>
  );

  // The phone's Albums: his albums as covers, then the media types as a list
  const albums = (
    <div className={`${pad} pb-8 pt-3`}>
      <h2 className="t-title3 pb-2 text-ink">My Albums</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {albumSets.map((a) => {
          const cover = a.items[0];
          return (
            <button key={a.id} type="button" onClick={() => setOpened(a.id)} className="press group text-left outline-none">
              <span
                className="sq-card relative block aspect-square overflow-hidden rounded-[14px] bg-[var(--fill-2)] bg-cover bg-center shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--accent)]"
                style={cover?.placeholder ? { backgroundImage: `url(${cover.placeholder})` } : undefined}
                data-sq=""
              >
                {cover && <TileImage src={cover.thumb} />}
              </span>
              <span className="mt-2 block truncate text-[15px] font-semibold text-ink">{a.title}</span>
              <span className="block tabular-nums text-[13px] text-ink-3">{a.items.length}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-7">
        <SectionHeader>Media Types</SectionHeader>
        <List>
          {typeSets.map((t) => (
            <ListRow key={t.id} onClick={() => setOpened(t.id)} icon={<Sym icon={t.icon!} size={22} weight="medium" className="text-[var(--accent-text)]" />} title={t.title} detail={<span className="tabular-nums text-ink-3">{t.items.length}</span>} chevron />
          ))}
        </List>
      </div>
    </div>
  );

  const viewer = (
    <AnimatePresence>
      {view && <Viewer key="viewer" list={view.list} index={view.index} label={view.label} originOf={originOf} setIndex={(i) => setView((v) => (v ? { ...v, index: i } : v))} close={() => setView(null)} />}
    </AnimatePresence>
  );

  if (compact) {
    const screen = tab === "library" ? "library" : (opened ?? "albums");
    const flat = screen === "library" || screen === "albums";
    return (
      <div ref={root} className="relative overflow-x-clip" {...pinch}>
        {/* an opened album is its own screen: Library and Albums wait under it */}
        <div className={`px-4 pb-1 ${flat ? "" : "hidden"}`}>
          <Segmented
            id="photos-tab"
            value={tab}
            onChange={(v) => {
              setTab(v);
              setOpened(null);
            }}
            options={[
              { value: "library", label: "Library" },
              { value: "albums", label: "Albums" },
            ]}
          />
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={screen}
            // an album slides in from the right over Albums, and back out; Library and Albums cross-fade
            initial={flat ? { opacity: 0 } : { x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={flat ? { opacity: 0, transition: M.out } : { x: "100%", transition: M.ui }}
            transition={flat ? M.fade : M.ui}
            className="bg-[var(--bg)]"
          >
            <Dense k={`${cols}`} from={from}>
              {screen === "library" ? library : screen === "albums" ? albums : album(setById(screen))}
            </Dense>
          </motion.div>
        </AnimatePresence>
        {viewer}
      </div>
    );
  }

  // The Mac: the sidebar, then the chosen set under a toolbar with its size
  const sideRow = (s: Collection) => {
    const on = s.id === picked;
    const cover = s.items[0];
    return (
      <button
        type="button"
        key={s.id}
        data-id={s.id}
        onClick={() => setPicked(s.id)}
        className={`flex h-[28px] shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] tracking-[-0.003em] text-ink ${on ? "bg-black/[0.08]" : "hov:hover:bg-black/[0.035]"}`}
      >
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[var(--accent-text)]">
          {s.icon ? (
            <Sym icon={s.icon} size={16} weight="medium" />
          ) : (
            // an album shows its cover, small
            // eslint-disable-next-line @next/next/no-img-element
            cover && <img src={cover.thumb} alt="" loading="lazy" decoding="async" className="h-[18px] w-[18px] rounded-[4px] object-cover" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{s.title}</span>
        <span className="text-[11px] tabular-nums text-ink-3">{s.items.length}</span>
      </button>
    );
  };
  const sideHead = (t: string) => <div className="mt-3 flex h-[22px] shrink-0 items-center px-2 text-[11px] font-semibold text-ink-3">{t}</div>;
  const set = shown ?? LIBRARY;
  return (
    <SplitFrame shown={side} setShown={setSide} className="flex h-full min-h-0">
      <aside
        data-drag
        data-shown={side}
        onClick={() => setSide(false)}
        onKeyDown={(e) => {
          // the arrow keys walk the sidebar like a real source list
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const ids = ALL.map((s) => s.id);
          const next = ids[Math.min(ids.length - 1, Math.max(0, ids.indexOf(picked) + (e.key === "ArrowDown" ? 1 : -1)))];
          e.preventDefault();
          setPicked(next);
          (e.currentTarget.querySelector(`[data-id="${next}"]`) as HTMLElement | null)?.focus();
        }}
        className="split-side flex w-[210px] shrink-0 flex-col overflow-auto border-r border-black/[0.06] bg-[#F4F4F6] px-2.5 pb-3 pt-[52px]"
      >
        {sideRow(LIBRARY)}
        {sideHead("Albums")}
        {albumSets.map(sideRow)}
        {sideHead("Media Types")}
        {typeSets.map(sideRow)}
      </aside>
      <div ref={root} className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg)]">
        <Toolbar title={set.title} sub={set.id === "library" ? [countOf(set.items), spanOf(set.items)].filter(Boolean).join(" · ") : countOf(set.items)}>
          <div className="flex items-center">
            <Btn variant="plain" size="sm" iconOnly label="Smaller" disabled={steps.mac === 0} onClick={() => change(-1)} icon={<Sym icon={Minus} size={14} weight="semibold" />} />
            <Btn variant="plain" size="sm" iconOnly label="Larger" disabled={steps.mac === MAC_SIZES.length - 1} onClick={() => change(1)} icon={<Sym icon={Plus} size={14} weight="semibold" />} />
          </div>
          {set.id === "shots" && (
            <Btn size="sm" href={shots.href} label={`Open ${shots.handle} on X`} icon={<XMark size={12} />}>
              {shots.handle}
            </Btn>
          )}
        </Toolbar>
        <div ref={scroller} className="@container relative min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={set.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade}>
              <Dense k={`${size}`} from={from}>
                {set.id === "library" ? library : album(set)}
              </Dense>
            </motion.div>
          </AnimatePresence>
        </div>
        {viewer}
      </div>
    </SplitFrame>
  );
}

// Over the Library's grid, as in Photos: the month of the row at the top, which changes as it scrolls by. It is read
// from the tiles under it (each carries its day), on a scroll anywhere, at most once a frame.
function DateLabel({ compact }: { compact: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(() => (LIBRARY_RUN[0]?.date ? monthOf(LIBRARY_RUN[0].date) : ""));
  useEffect(() => {
    const el = ref.current;
    const grid = el?.nextElementSibling as HTMLElement | null;
    if (!el || !grid) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const line = el.getBoundingClientRect().bottom;
      for (const t of grid.children as unknown as HTMLElement[]) {
        // the first row mostly below the line: one only peeking out under the label does not count
        const r = t.getBoundingClientRect();
        if (r.bottom - r.height / 2 > line) {
          const d = t.dataset.date;
          if (d) setText(monthOf(d));
          return;
        }
      }
    };
    const on = () => void (raf ||= requestAnimationFrame(read));
    window.addEventListener("scroll", on, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", on, true);
      cancelAnimationFrame(raf);
    };
  }, []);
  if (!text) return null;
  return (
    <div ref={ref} className={`pointer-events-none sticky z-10 h-0 ${compact ? "top-[calc(var(--phone-top)+52px)]" : "top-0"}`}>
      <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-white shadow-[0_1px_8px_rgb(0_0_0/0.2)] backdrop-blur-md">{text}</span>
    </div>
  );
}

// the grid at a new density grows (or shrinks) in from where the change was made
function Dense({ k, from, children }: { k: string; from: From; children: React.ReactNode }) {
  return (
    <motion.div key={k} initial={from ? { scale: from.k, opacity: 0.4 } : false} animate={{ scale: 1, opacity: 1 }} transition={M.ui} style={{ transformOrigin: from ? `${from.x} ${from.y}` : undefined }}>
      {children}
    </motion.div>
  );
}

export function Gallery() {
  return <Photos start="library" />;
}
export function Shots() {
  return <Photos start="shots" />;
}
