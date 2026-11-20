"use client";

// Records: Now Playing and the queue.

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronLeft, ListMusic, Pause, Play, SkipBack, SkipForward, Volume1, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { art, novel, tracks } from "@/content";
import { Bars } from "../Desktop";
import { useOS } from "@/store";
import { Btn, glass, List, ListRow, useChrome } from "../ui";
import { trackOf, player, usePlayer } from "./player";
import { LiveWallpaper } from "../Apps";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------- Music: now playing over the artwork's own colours, a queue beside it ----------

function Scrubber({ dark = true }: { dark?: boolean }) {
  const p = usePlayer();
  const cur = trackOf(p.id);
  const [scrub, setScrub] = useState<number | null>(null);
  const total = p.dur || cur?.duration || tracks[0]?.duration || 0;
  const shown = scrub ?? p.t;
  const commit = () => {
    if (scrub !== null) player.seek(scrub);
    setScrub(null);
  };
  return (
    <div>
      <input
        type="range"
        aria-label="Position"
        min={0}
        max={Math.max(1, total)}
        step={0.1}
        value={Math.min(shown, total || 1)}
        disabled={!cur}
        onChange={(e) => setScrub(+e.target.value)}
        onPointerUp={commit}
        onKeyUp={commit}
        className={`scrub w-full ${dark ? "scrub-light" : ""}`}
        style={{ ["--p" as string]: `${total ? (Math.min(shown, total) / total) * 100 : 0}%` }}
      />
      <div className={`m-sub mt-0.5 flex justify-between tabular-nums ${dark ? "text-white/55" : "text-ink-3"}`}>
        <span>{clock(shown)}</span>
        <span>-{clock(Math.max(0, total - shown))}</span>
      </div>
    </div>
  );
}

function Transport({ size = 1 }: { size?: number }) {
  const p = usePlayer();
  const i = Math.max(0, tracks.findIndex((t) => t.id === p.id));
  const go = (d: number) => player.play(tracks[(i + d + tracks.length) % tracks.length].id);
  return (
    <div className="flex items-center justify-center gap-7 text-white">
      <button type="button" aria-label="Previous" onClick={() => go(-1)} className="press opacity-90 hov:hover:opacity-100">
        <SkipBack size={26 * size} fill="currentColor" />
      </button>
      <button type="button" aria-label={p.playing ? "Pause" : "Play"} onClick={() => player.toggle()} className="press">
        {p.playing ? <Pause size={40 * size} fill="currentColor" /> : <Play size={40 * size} fill="currentColor" />}
      </button>
      <button type="button" aria-label="Next" onClick={() => go(1)} className="press opacity-90 hov:hover:opacity-100">
        <SkipForward size={26 * size} fill="currentColor" />
      </button>
    </div>
  );
}

// the artwork's own colours, blurred, behind everything; the shader joins in while music plays
function MusicBackdrop() {
  const p = usePlayer();
  const lead = trackOf(p.id) ?? tracks[0];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0c10]">
      <AnimatePresence initial={false}>
        <motion.div key={lead.cover} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lead.cover} alt="" className="absolute inset-[-20%] h-[140%] w-[140%] object-cover blur-[70px] saturate-[1.7]" />
        </motion.div>
      </AnimatePresence>
      <motion.div className="absolute inset-0 mix-blend-screen" animate={{ opacity: p.playing ? 0.55 : 0 }} transition={{ duration: 0.8 }}>
        {p.playing && <LiveWallpaper fallback={lead.cover} />}
      </motion.div>
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
}

function NowPlaying({ compact }: { compact: boolean }) {
  const p = usePlayer();
  const lead = trackOf(p.id) ?? tracks[0];
  return (
    <div className="relative flex h-full flex-col overflow-hidden text-white" style={compact ? undefined : { containerType: "size" }}>
      {compact && <MusicBackdrop />}
      <div className={`relative flex flex-1 flex-col ${compact ? "px-7 pb-10 pt-[calc(var(--phone-top)+18px)]" : "justify-center px-10 py-8"}`}>
        <motion.img
          key={lead.id}
          src={lead.cover}
          alt={lead.title}
          draggable={false}
          animate={{ scale: p.playing || !p.id ? 1 : 0.86 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
          data-sq=""
          // in a short window the artwork gives way first, so the transport and the volume always fit
          style={compact ? undefined : { width: "min(340px, 100%, 100cqh - 300px)" }}
          className={`mx-auto aspect-square w-full object-cover shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)] ${compact ? "max-w-[320px] rounded-[18px]" : "max-w-[340px] rounded-[18px]"}`}
        />
        <div className={`mx-auto w-full ${compact ? "mt-9 max-w-[320px]" : "mt-7 max-w-[340px]"}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-[20px] font-semibold leading-6 tracking-[-0.02em] [text-wrap:balance]">{lead.title}</div>
              <div className={`truncate text-white/60 ${compact ? "text-[17px]" : "text-[15px]"}`}>{lead.artist}</div>
            </div>
            {!lead.confirmed && <span className="m-sub shrink-0 rounded-[8px] bg-white/15 px-1.5 py-0.5 text-white/80">Unreleased</span>}
          </div>
          <div className="mt-4">
            <Scrubber />
          </div>
          <div className="mt-3">
            <Transport size={compact ? 1 : 0.9} />
          </div>
          <VolumeSlider />
        </div>
      </div>
    </div>
  );
}

function VolumeSlider() {
  const [v, setV] = useState(1);
  return (
    <div className="mt-5 flex items-center gap-2.5 text-white/70">
      <Volume1 size={15} />
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={v}
        onChange={(e) => {
          setV(+e.target.value);
          player.volume(+e.target.value);
        }}
        className="scrub scrub-light min-w-0 flex-1"
        style={{ ["--p" as string]: `${v * 100}%` }}
      />
      <Volume2 size={15} />
    </div>
  );
}

// Up Next on the same surface: large type on a translucent material, the current piece lit
function GlassQueue() {
  const p = usePlayer();
  return (
    <div data-drag className="on-dark relative flex h-full flex-col overflow-auto border-l border-white/10 bg-white/[0.07] px-6 pb-6 pt-[60px] text-white [backdrop-filter:blur(30px)_saturate(1.6)]">
      <div className="eyebrow mb-3 text-white/50">Up Next</div>
      <div className="space-y-1">
        {tracks.map((t) => {
          const on = p.id === t.id;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => player.toggle(t.id)}
              className={`press group flex w-full items-center gap-3.5 rounded-[18px] p-2.5 text-left transition-colors duration-150 ${on ? "bg-white/[0.14]" : "hov:hover:bg-white/[0.08]"}`}
              data-sq=""
            >
              <span className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.cover} alt="" className="h-14 w-14 rounded-[12px] object-cover shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)]" />
                {on && p.playing && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-[12px] bg-black/45">
                    <Bars light />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`line-clamp-2 text-[17px] leading-[22px] tracking-[-0.02em] [text-wrap:balance] ${on ? "font-semibold" : "font-medium text-white/90"}`}>{t.title}</span>
                <span className="line-clamp-2 text-[13px] leading-[18px] text-white/55">{t.note}</span>
              </span>
              <span className="text-[13px] tabular-nums text-white/50">{t.durationLabel}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-auto pt-8 text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-white/35 [text-wrap:balance]">
        Music written for the novel <span className="text-white/70">{novel.title}</span>.
      </p>
      {art.spotify.href && (
        <div className="mt-4">
          <Btn variant="glass-dark" capsule href={art.spotify.href} icon={<ArrowUpRight size={14} />}>
            Spotify
          </Btn>
        </div>
      )}
    </div>
  );
}

function Queue({ compact }: { compact: boolean }) {
  const p = usePlayer();
  return (
    <div className={compact ? "" : "h-full overflow-auto bg-[var(--bg)] px-3 pb-4 pt-[52px]"} data-drag={compact ? undefined : ""}>
      {!compact && <div className="m-headline px-2 pb-2 text-ink">Up Next</div>}
      <List mac={!compact}>
        {tracks.map((t, i) => {
          const on = p.id === t.id;
          return (
            <ListRow
              key={t.id}
              mac={!compact}
              onClick={() => player.toggle(t.id)}
              icon={
                <span className={`relative block shrink-0 overflow-hidden shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${compact ? "my-2 h-12 w-12 rounded-[10px]" : "h-9 w-9 rounded-[8px]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.cover} alt="" width={96} height={96} className="h-full w-full object-cover" />
                  {on && p.playing && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/40">
                      <Bars light />
                    </span>
                  )}
                </span>
              }
              title={<span className={on ? "font-semibold text-[var(--accent-text)]" : ""}>{t.title}</span>}
              sub={t.note}
              detail={<span className="tabular-nums">{t.durationLabel}</span>}
            />
          );
        })}
      </List>
      {art.spotify.href && (
        <div className="mt-3 px-1">
          <Btn size="sm" href={art.spotify.href} icon={<ArrowUpRight size={14} />}>
            Spotify
          </Btn>
        </div>
      )}
    </div>
  );
}

export function Records() {
  const { compact } = useChrome();
  const p = usePlayer();
  const cur = trackOf(p.id);
  const [full, setFull] = useState(false);
  const [queue, setQueue] = useState(false);
  // closing the window quits the app, like Music; on the phone it keeps playing under the Dynamic Island
  useEffect(() => () => void (!useOS.getState().isMobile && player.stop()), []);
  // Now Playing is dark to the top edge: the status bar turns white over it
  useEffect(() => {
    if (!compact) return;
    useOS.getState().setHeroDark(full);
    return () => useOS.getState().setHeroDark(false);
  }, [compact, full]);
  if (!compact)
    return (
      <div className="@container/rec relative h-full min-h-0">
        <MusicBackdrop />
        <div className="relative grid h-full min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] @max-[659px]/rec:grid-cols-1">
          <div data-drag className="min-h-0">
            <NowPlaying compact={false} />
          </div>
          {/* two columns while there is room; in a narrow window Up Next slides over from the right */}
          {queue && <button type="button" aria-label="Hide Up Next" tabIndex={-1} onClick={() => setQueue(false)} className="absolute inset-0 z-[9] hidden cursor-default @max-[659px]/rec:block" />}
          <div data-shown={queue} className="rec-queue min-h-0">
            <GlassQueue />
          </div>
        </div>
        <Btn variant="glass-dark" capsule iconOnly size="md" label={queue ? "Hide Up Next" : "Up Next"} icon={<ListMusic size={16} />} onClick={() => setQueue((v) => !v)} className="!absolute right-3 top-2.5 z-[11] !hidden @max-[659px]/rec:!inline-flex" />
      </div>
    );
  return (
    <div className="px-4 pb-28">
      <Queue compact />
      {/* the mini player; tap it for Now Playing */}
      <motion.button
        type="button"
        layoutId="np"
        onClick={() => setFull(true)}
        data-glass=""
        className={`${glass("pop")} fixed inset-x-3 bottom-[calc(var(--phone-bottom)+6px)] z-[30] flex h-14 items-center gap-3 rounded-[20px] px-2 text-left`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={(cur ?? tracks[0]).cover} alt="" className="h-10 w-10 rounded-[10px] object-cover" />
        <span className="t-sub min-w-0 flex-1 truncate font-medium text-ink">{cur?.title ?? "Not Playing"}</span>
        <span
          role="button"
          aria-label={p.playing ? "Pause" : "Play"}
          onClick={(e) => {
            e.stopPropagation();
            player.toggle();
          }}
          className="flex h-10 w-10 items-center justify-center text-ink"
        >
          {p.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </span>
      </motion.button>
      <AnimatePresence>
        {full && (
          <motion.div
            key="np-full"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 700) && setFull(false)}
            className="fixed inset-0 z-[45] overflow-hidden rounded-t-[28px]"
          >
            <span className="absolute left-1/2 top-[var(--phone-top)] z-10 h-[5px] w-9 -translate-x-1/2 rounded-full bg-white/40" />
            <NowPlaying compact />
            <button
              type="button"
              aria-label="Close Now Playing"
              onClick={() => setFull(false)}
              data-glass=""
              className={`${glass("btn-dark")} glass-press absolute bottom-[calc(var(--phone-bottom)+6px)] left-1/2 z-10 -ml-[22px] flex h-11 w-11 items-center justify-center rounded-full text-white/90`}
            >
              <ChevronLeft size={22} strokeWidth={2.4} className="-rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Novel: a Books-style library and reader ----------
