"use client";

// Gallery: photographs and films, Apple Photos style. The Library is every trip in its own section under a few
// words from him; Albums is his albums as covers and the media types (Videos, Drone, Photos) as a list. Films play
// silently in the grid while they are in sight; anything opens into a viewer that steps through the set (arrows,
// keys, a swipe or the filmstrip) and starts a film at once.

import { AnimatePresence, animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { flushSync } from "react-dom";
import { ArrowUpRight, ChevronLeft, ChevronRight, Drone, Film, Image as ImageIcon, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { gallery, type Album, type Media } from "@/content";
import { useOS } from "@/store";
import { Sym } from "../symbols";
import { Btn, List, ListRow, M, reducedMotion, SectionHeader, Segmented, Toolbar, useChrome, usePhoneBack } from "../ui";

const byId = new Map(gallery.media.map((m) => [m.id, m]));
const itemsOf = (a: Album) => a.items.map((id) => byId.get(id)).filter((m): m is Media => !!m);
// a set to look through: one of his albums, or everything of one kind
type Collection = { id: string; title: string; sub: string; items: Media[] };
const albumSets: Collection[] = gallery.albums.map((a) => ({ id: a.id, title: a.title, sub: a.sub, items: itemsOf(a) }));
const typeSets: (Collection & { icon: typeof Film })[] = [
  { id: "videos", title: "Videos", sub: "Every film", icon: Film, items: gallery.media.filter((m) => m.kind === "video") },
  { id: "drone", title: "Drone", sub: "From the air", icon: Drone, items: gallery.media.filter((m) => m.drone) },
  { id: "photos", title: "Photos", sub: "Every photograph", icon: ImageIcon, items: gallery.media.filter((m) => m.kind === "photo") },
];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// a tiny copy of the same picture, shown blurred while the full one loads (Unsplash sizes on request)
const lowRes = (m: Media) => (m.kind === "photo" ? m.src.replace(/w=\d+/, "w=48") : m.poster);

function Tile({ m, onOpen }: { m: Media; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={m.kind === "video" ? `${m.title}, film, ${clock(m.duration ?? 0)}` : m.title}
      className="group relative block aspect-square overflow-hidden bg-[var(--fill-2)] outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
    >
      {m.kind === "video" ? (
        <TilePreview m={m} />
      ) : (
        <TileImage src={m.thumb} />
      )}
      {m.kind === "video" && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold tabular-nums text-white">
          <Sym icon={Play} size={10} fill />
          {clock(m.duration ?? 0)}
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
function TilePreview({ m }: { m: Media }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!v || reducedMotion() || saveData) return;
    v.muted = true;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={m.src} poster={m.thumb} muted loop playsInline preload="none" disablePictureInPicture className="h-full w-full object-cover" aria-hidden />;
}

function Grid({ items, open, compact }: { items: Media[]; open: (i: number) => void; compact: boolean }) {
  return (
    <div className={`grid gap-[2px] ${compact ? "grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"}`}>
      {items.map((m, i) => (
        <Tile key={m.id} m={m} onOpen={() => open(i)} />
      ))}
    </div>
  );
}

// One picture or film in the viewer. Only the one in view plays: its neighbours wait as their posters.
function Slide({ m, current, loaded, onLoad }: { m: Media; current: boolean; loaded: boolean; onLoad: () => void }) {
  if (m.kind === "video" && current)
    // muted, so it starts at once everywhere (a browser holds back a film with sound until it is asked); the sound
    // is one tap away in its controls
    return <video src={m.src} poster={m.poster} controls autoPlay muted playsInline className="max-h-full max-w-full rounded-[10px] bg-black object-contain" />;
  const src = m.kind === "video" ? m.poster : m.src;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!loaded && m.kind === "photo" && <img src={lowRes(m)} alt="" aria-hidden className="absolute max-h-full max-w-full object-contain blur-xl" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={current ? m.title : ""} draggable={false} onLoad={onLoad} className={`relative max-h-full max-w-full select-none object-contain transition-opacity duration-300 ${loaded || m.kind === "video" ? "opacity-100" : "opacity-0"}`} />
    </>
  );
}

// The filmstrip under the viewer: every item small, the one in view lit and kept in the middle; a tap jumps to it.
function Strip({ list, index, pick, opacity }: { list: Media[]; index: number; pick: (i: number) => void; opacity: ReturnType<typeof useMotionValue<number>> }) {
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
function Viewer({ list, index, setIndex, close, label }: { list: Media[]; index: number; setIndex: (i: number) => void; close: () => void; label?: string }) {
  const { compact } = useChrome();
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
      if (many && e.key === "ArrowRight") go(1);
      if (many && e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // a swipe in from the left edge of the phone puts it away too
  usePhoneBack(true, close);
  // on the phone the viewer is black to the top edge: the status bar turns white over it
  useEffect(() => {
    if (!compact) return;
    useOS.getState().setHeroDark(true);
    return () => useOS.getState().setHeroDark(false);
  }, [compact]);

  const g = useRef<{ id: number; x0: number; y0: number; bx: number; axis: "x" | "y" | null; hist: { x: number; y: number; t: number }[] } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (g.current || (e.pointerType === "mouse" && !compact)) return;
    // the film's own controls keep their touches
    const t = e.target as HTMLElement;
    if (t.tagName === "VIDEO" && e.clientY > t.getBoundingClientRect().bottom - 64) return;
    anim.current?.stop();
    tok.current++;
    land();
    g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, bx: x.get(), axis: null, hist: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x0;
    const dy = e.clientY - s.y0;
    if (!s.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      s.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // the stage fills the screen: the finger stays over it anyway
      }
    }
    s.hist.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (s.hist.length > 5) s.hist.shift();
    // past the first or last there is nothing more: it gives, but only a little
    if (s.axis === "x") x.set(s.bx + (many ? dx : dx * 0.3));
    else y.set(dy > 0 ? dy : dy * 0.2);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (!s.axis) return;
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
      <div ref={stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="relative min-h-0 flex-1 touch-none overflow-hidden" data-viewer-stage="">
        <motion.div className="absolute inset-0" style={{ x, y, scale: shrink }}>
          {slots.map((d) => {
            const it = list[wrap(index + d)];
            return (
              <div key={it.id + (many && list.length < 3 && d ? `:${d}` : "")} className="absolute inset-0 flex items-center justify-center px-2 py-3" style={{ transform: `translateX(calc(${d * 100}% + ${d * GAP}px))` }} aria-hidden={d !== 0}>
                <Slide m={it} current={d === 0} loaded={!!loaded[it.id]} onLoad={() => setLoaded((l) => (l[it.id] ? l : { ...l, [it.id]: true }))} />
              </div>
            );
          })}
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
        {m.kind === "video" ? "Film" : "Photo"} by{" "}
        <a href={m.credit.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-white/75 hover:text-white">
          {m.credit.by}
          {m.credit.by !== m.credit.site && ` on ${m.credit.site}`}
          <Sym icon={ArrowUpRight} size={11} weight="medium" />
        </a>
      </motion.div>
    </motion.div>
  );
}

export function Gallery() {
  const { compact } = useChrome();
  const [tab, setTab] = useState<"library" | "albums">("library");
  const [set, setSet] = useState<Collection | null>(null);
  const [view, setView] = useState<{ list: Media[]; index: number; label: string } | null>(null);
  // the Library is every trip in order; Best of is an album of what's already there
  const trips = useMemo(() => albumSets.filter((a) => a.id !== "best"), []);
  const pad = compact ? "px-4" : "px-5";
  // an album is a screen of its own: the edge swipe goes back to the albums
  usePhoneBack(!!set, () => setSet(null));
  // a new screen (an album opened, or back to the list, or the other tab) starts at its top
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.closest(".overflow-y-auto, .overflow-auto")?.scrollTo({ top: 0 });
    top.current?.querySelector(":scope > .overflow-auto")?.scrollTo({ top: 0 });
  }, [set, tab]);

  const library = (
    <div className="pb-8">
      <p className={`${pad} max-w-[620px] pb-1 pt-2 text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "m-body"}`}>{gallery.intro}</p>
      {trips.map((a) => (
        <section key={a.id} className="pt-5">
          <div className={`${pad} flex items-baseline gap-2 pb-2`}>
            <h2 className={compact ? "t-title3 text-ink" : "m-large text-ink"}>{a.title}</h2>
            <span className={`min-w-0 truncate text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{a.sub}</span>
          </div>
          <Grid items={a.items} compact={compact} open={(i) => setView({ list: a.items, index: i, label: a.title })} />
        </section>
      ))}
    </div>
  );

  const albums = (
    <div className={`${pad} pb-8 pt-3`}>
      <h2 className={`pb-2 text-ink ${compact ? "t-title3" : "m-headline"}`}>My Albums</h2>
      <div className={`grid gap-x-4 gap-y-5 ${compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"}`}>
        {albumSets.map((a) => {
          const cover = a.items[0];
          return (
            <button key={a.id} type="button" onClick={() => setSet(a)} className="press group text-left outline-none">
              <span className="sq-card relative block aspect-square overflow-hidden rounded-[14px] bg-[var(--fill-2)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--accent)]" data-sq="">
                {cover && <TileImage src={cover.thumb} />}
              </span>
              <span className={`mt-2 block truncate font-semibold text-ink ${compact ? "text-[15px]" : "text-[13px]"}`}>{a.title}</span>
              <span className={`block tabular-nums text-ink-3 ${compact ? "text-[13px]" : "text-[12px]"}`}>{a.items.length}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-7">
        <SectionHeader mac={!compact}>Media Types</SectionHeader>
        <List mac={!compact}>
          {typeSets.map((t) => (
            <ListRow
              key={t.id}
              mac={!compact}
              onClick={() => setSet(t)}
              icon={<Sym icon={t.icon} size={compact ? 22 : 17} weight="medium" className="text-[var(--accent-text)]" />}
              title={t.title}
              detail={<span className="tabular-nums text-ink-3">{t.items.length}</span>}
              chevron
            />
          ))}
        </List>
      </div>
    </div>
  );

  const opened = set && (
    <div className="pb-8">
      <div className={`${pad} pb-3 pt-2`}>
        <button type="button" onClick={() => setSet(null)} className="press -ml-1 inline-flex items-center gap-0.5 text-[15px] text-[var(--accent-text)]">
          <Sym icon={ChevronLeft} size={18} weight="semibold" />
          Albums
        </button>
        <h2 className={`mt-1 ${compact ? "t-title2" : "m-large"} text-ink`}>{set.title}</h2>
        <p className={`tabular-nums text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{`${set.sub} · ${set.items.length}`}</p>
      </div>
      <Grid items={set.items} compact={compact} open={(i) => setView({ list: set.items, index: i, label: set.title })} />
    </div>
  );

  const tabs = (
    <Segmented
      id="gallery-tab"
      value={tab}
      onChange={(v) => {
        setTab(v);
        setSet(null);
      }}
      options={[
        { value: "library", label: "Library" },
        { value: "albums", label: "Albums" },
      ]}
    />
  );
  return (
    <div ref={top} className="@container relative flex h-full min-h-0 flex-col bg-[var(--bg)]">
      {!compact && <Toolbar title="Gallery" sub={`${gallery.media.length} photos and films`}>{tabs}</Toolbar>}
      {compact && <div className="px-4 pb-1">{tabs}</div>}
      <div className={compact ? "" : "min-h-0 flex-1 overflow-auto"}>{tab === "library" ? library : (opened ?? albums)}</div>
      <AnimatePresence>{view && <Viewer list={view.list} index={view.index} label={view.label} setIndex={(i) => setView({ ...view, index: i })} close={() => setView(null)} />}</AnimatePresence>
    </div>
  );
}
