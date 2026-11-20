"use client";

// Gallery: photographs and films, Apple Photos style. The Library shows every trip in its own section, Albums shows
// the trips and the best of them as covers; any picture or film opens out of its tile into a viewer that steps
// through the set (arrows, keys or a swipe) and plays films with a proper player.

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { gallery, type Album, type Media } from "@/content";
import { useOS } from "@/store";
import { Sym } from "../symbols";
import { Btn, M, Segmented, Toolbar, useChrome } from "../ui";

const byId = new Map(gallery.media.map((m) => [m.id, m]));
const itemsOf = (a: Album) => a.items.map((id) => byId.get(id)).filter((m): m is Media => !!m);
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
      <motion.img
        layoutId={`media-${m.id}`}
        src={m.thumb}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className="h-full w-full object-cover transition-[filter] duration-200 hov:group-hover:brightness-[1.06]"
      />
      {m.kind === "video" && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold tabular-nums text-white">
          <Sym icon={Play} size={10} fill />
          {clock(m.duration ?? 0)}
        </span>
      )}
    </button>
  );
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

function Viewer({ list, index, setIndex, close }: { list: Media[]; index: number; setIndex: (i: number) => void; close: () => void }) {
  const { compact } = useChrome();
  const m = list[index];
  const many = list.length > 1;
  const step = (d: number) => setIndex((index + d + list.length) % list.length);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [m.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (many && e.key === "ArrowRight") step(1);
      if (many && e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // on the phone the viewer is black to the top edge: the status bar turns white over it
  useEffect(() => {
    if (!compact) return;
    useOS.getState().setHeroDark(true);
    return () => useOS.getState().setHeroDark(false);
  }, [compact]);
  return (
    <motion.div
      key="viewer"
      role="dialog"
      aria-label={m.title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: M.out }}
      transition={M.fade}
      className={`${compact ? "fixed z-[2400] bg-black" : "absolute z-30 bg-black/95"} inset-0 flex flex-col text-white`}
    >
      <div className={`flex shrink-0 items-center gap-3 px-4 ${compact ? "pt-[calc(var(--phone-top)+4px)]" : "pt-3"}`}>
        <Btn variant="glass-dark" capsule iconOnly size="md" label="Close" onClick={close} icon={<Sym icon={X} size={17} weight="semibold" />} className="!h-10 !w-10" />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold">{m.title}</div>
          {many && <div className="text-[12px] text-white/50">{`${index + 1} of ${list.length}`}</div>}
        </div>
        <span className="w-10" />
      </div>
      <motion.div
        className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center px-2 py-3"
        drag={compact}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.5}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110) return close();
          if (!many) return;
          if (info.offset.x < -70) step(1);
          if (info.offset.x > 70) step(-1);
        }}
      >
        {m.kind === "video" ? (
          <motion.video
            layoutId={`media-${m.id}`}
            key={m.id}
            src={m.src}
            poster={m.poster}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-[10px] bg-black object-contain"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {!loaded && <img src={lowRes(m)} alt="" aria-hidden className="absolute max-h-[calc(100%-24px)] max-w-[calc(100%-16px)] object-contain blur-xl" />}
            <motion.img
              layoutId={`media-${m.id}`}
              key={m.id}
              src={m.src}
              alt={m.title}
              draggable={false}
              onLoad={() => setLoaded(true)}
              className={`relative max-h-full max-w-full select-none object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          </>
        )}
        {many && !compact && (
          <>
            <Btn variant="glass-dark" capsule iconOnly size="md" label="Previous" onClick={() => step(-1)} icon={<Sym icon={ChevronLeft} size={20} weight="semibold" />} className="!absolute left-4 top-1/2 !h-11 !w-11 -translate-y-1/2" />
            <Btn variant="glass-dark" capsule iconOnly size="md" label="Next" onClick={() => step(1)} icon={<Sym icon={ChevronRight} size={20} weight="semibold" />} className="!absolute right-4 top-1/2 !h-11 !w-11 -translate-y-1/2" />
          </>
        )}
      </motion.div>
      <div className={`shrink-0 px-4 text-center text-[12px] text-white/50 ${compact ? "pb-[calc(var(--phone-bottom)+8px)]" : "pb-3"}`}>
        {m.kind === "video" ? "Film" : "Photo"} by{" "}
        <a href={m.credit.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-white/75 hover:text-white">
          {m.credit.by}
          {m.credit.by !== m.credit.site && ` on ${m.credit.site}`}
          <Sym icon={ArrowUpRight} size={11} weight="medium" />
        </a>
      </div>
    </motion.div>
  );
}

export function Gallery() {
  const { compact } = useChrome();
  const [tab, setTab] = useState<"library" | "albums">("library");
  const [album, setAlbum] = useState<Album | null>(null);
  const [view, setView] = useState<{ list: Media[]; index: number } | null>(null);
  // the Library is every trip in order; Best of and Films are albums of what's already there
  const trips = useMemo(() => gallery.albums.filter((a) => a.id !== "best" && a.id !== "films"), []);
  const pad = compact ? "px-4" : "px-5";

  const library = (
    <div className="pb-8">
      {trips.map((a) => {
        const items = itemsOf(a);
        return (
          <section key={a.id} className="pt-5 first:pt-2">
            <div className={`${pad} flex items-baseline gap-2 pb-2`}>
              <h2 className={compact ? "t-title3 text-ink" : "m-large text-ink"}>{a.title}</h2>
              <span className={`min-w-0 truncate text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{a.sub}</span>
            </div>
            <Grid items={items} compact={compact} open={(i) => setView({ list: items, index: i })} />
          </section>
        );
      })}
    </div>
  );

  const albums = (
    <div className={`${pad} grid gap-x-4 gap-y-5 pb-8 pt-3 ${compact ? "grid-cols-2" : "grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"}`}>
      {gallery.albums.map((a) => {
        const items = itemsOf(a);
        const cover = items[0];
        return (
          <button key={a.id} type="button" onClick={() => setAlbum(a)} className="press group text-left outline-none">
            <span className="sq-card block aspect-square overflow-hidden rounded-[14px] bg-[var(--fill-2)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)] group-focus-visible:ring-[3px] group-focus-visible:ring-[var(--accent)]" data-sq="">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {cover && <img src={cover.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
            </span>
            <span className={`mt-2 block truncate font-semibold text-ink ${compact ? "text-[15px]" : "text-[13px]"}`}>{a.title}</span>
            <span className={`block text-ink-3 ${compact ? "text-[13px]" : "text-[12px]"}`}>{items.length}</span>
          </button>
        );
      })}
    </div>
  );

  const albumView = album && (
    <div className="pb-8">
      <div className={`${pad} pb-3 pt-2`}>
        <button type="button" onClick={() => setAlbum(null)} className="press -ml-1 inline-flex items-center gap-0.5 text-[15px] text-[var(--accent-text)]">
          <Sym icon={ChevronLeft} size={18} weight="semibold" />
          Albums
        </button>
        <h2 className={`mt-1 ${compact ? "t-title2" : "m-large"} text-ink`}>{album.title}</h2>
        <p className={`text-ink-3 ${compact ? "t-foot" : "m-sub"}`}>{album.sub}</p>
      </div>
      <Grid items={itemsOf(album)} compact={compact} open={(i) => setView({ list: itemsOf(album), index: i })} />
    </div>
  );

  const tabs = (
    <Segmented
      id="gallery-tab"
      value={tab}
      onChange={(v) => {
        setTab(v);
        setAlbum(null);
      }}
      options={[
        { value: "library", label: "Library" },
        { value: "albums", label: "Albums" },
      ]}
    />
  );
  return (
    <div className="@container relative flex h-full min-h-0 flex-col bg-[var(--bg)]">
      {!compact && <Toolbar title="Gallery" sub={`${gallery.media.length} photos and films`}>{tabs}</Toolbar>}
      {compact && <div className="px-4 pb-1">{tabs}</div>}
      <div className={compact ? "" : "min-h-0 flex-1 overflow-auto"}>{tab === "library" ? library : (albumView ?? albums)}</div>
      <AnimatePresence>{view && <Viewer list={view.list} index={view.index} setIndex={(i) => setView({ ...view, index: i })} close={() => setView(null)} />}</AnimatePresence>
    </div>
  );
}
