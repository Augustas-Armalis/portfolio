"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { getAnalyser, tapMediaElement } from "@/lib/audio";
import { play } from "@/lib/sfx";

// DOM controls for the focused desk modes. Quiet, glassy, dark-on-light pills
// that sit over the 3D scene. Every mode has the same exit: Esc or "Put down".

const EASE = [0.22, 1, 0.36, 1] as const;
const pill = "rounded-full bg-black/35 text-white backdrop-blur-xl shadow-[0_8px_30px_-12px_rgb(0_0_0/0.5),inset_0_0.5px_0_rgb(255_255_255/0.15)]";
const btn = "press pointer-events-auto rounded-full px-3.5 h-8 text-[13px] font-medium text-white/90 hov:hover:bg-white/15 hov:hover:text-white";

export function TopBar({ title, hint, exitLabel = "Put down", onExit }: { title: string; hint?: string; exitLabel?: string; onExit: () => void }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <div className={`${pill} flex items-center gap-1 p-1 pl-4`}>
        <span className="text-[13px] font-semibold">{title}</span>
        {hint && <span className="ml-2 hidden text-[12px] text-white/60 sm:inline">{hint}</span>}
        <button type="button" className={`${btn} ml-2 bg-white/12`} onClick={(e) => (e.stopPropagation(), onExit())}>
          {exitLabel}
          <span className="ml-1.5 text-white/45">Esc</span>
        </button>
      </div>
    </motion.div>
  );
}

function Bottom({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
    >
      {children}
    </motion.div>
  );
}

// ---------- piano ----------

export function PianoUI({ onExit }: { onExit: () => void }) {
  return <TopBar title="Piano" hint="Click the keys, or play A–L and W E T Y U O P" onExit={onExit} />;
}

// ---------- camera ----------

export function CameraUI({ onExit, onShoot }: { onExit: () => void; onShoot: () => string | null }) {
  const [shots, setShots] = useState<string[]>([]);
  const [flash, setFlash] = useState(0);
  const shoot = () => {
    play("shutter");
    const url = onShoot();
    setFlash((f) => f + 1);
    if (url) setShots((s) => [url, ...s].slice(0, 6));
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const save = (url: string, i: number) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `augustas-field-${i + 1}.png`;
    a.click();
  };
  return (
    <>
      <TopBar title="Camera" hint="Drag to frame, Space to shoot" onExit={onExit} />
      {/* viewfinder: frame lines, rule-of-thirds and focus brackets */}
      <motion.div className="pointer-events-none absolute inset-0 z-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
        <div className="absolute inset-[6%] rounded-[6px] border border-white/45" />
        <div className="absolute inset-[6%]">
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/15" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/15" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/15" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/15" />
        </div>
        <div className="absolute left-1/2 top-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2">
          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "left-0 bottom-0 border-l border-b", "right-0 bottom-0 border-r border-b"].map((c) => (
            <div key={c} className={`absolute h-3 w-3 border-white/90 ${c}`} />
          ))}
        </div>
        <div className="absolute left-[7.5%] top-[7.5%] font-mono text-[11px] text-white/80">ƒ/2.0 · 1/250 · ISO 100</div>
        <AnimatePresence>
          {flash > 0 && (
            <motion.div key={flash} className="absolute inset-0 bg-white" initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.35 }} />
          )}
        </AnimatePresence>
      </motion.div>
      <Bottom>
        <div className="flex w-full max-w-[720px] items-end justify-between gap-3">
          <div className="pointer-events-auto flex gap-2">
            {shots.map((s, i) => (
              <motion.div key={s.slice(-40)} className="group relative" initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s} alt="" className="h-14 w-20 rounded-[6px] object-cover shadow-[0_6px_20px_-8px_rgb(0_0_0/0.6)] ring-1 ring-white/30" />
                <button type="button" className="absolute inset-x-1 bottom-1 rounded-full bg-black/55 py-0.5 text-[10px] font-semibold text-white opacity-0 backdrop-blur group-hover:opacity-100 max-sm:opacity-100" onClick={(e) => (e.stopPropagation(), save(s, i))}>
                  Save
                </button>
              </motion.div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Take photo"
            className="press pointer-events-auto grid h-16 w-16 shrink-0 place-items-center rounded-full border-[3px] border-white/90 bg-white/10 backdrop-blur"
            onClick={(e) => (e.stopPropagation(), shoot())}
          >
            <span className="h-12 w-12 rounded-full bg-white" />
          </button>
          <div className="w-20" />
        </div>
      </Bottom>
    </>
  );
}

// ---------- music ----------

type Track = { id: string; title: string; artist: string; file: string; cover: string; duration: number };
let media: HTMLAudioElement | null = null;
let tapped = false;

export function MusicUI({ onExit }: { onExit: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const wave = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/content/music/tracks.json")
      .then((r) => r.json())
      .then((d: Track[]) => setTracks(d))
      .catch(() => {});
    if (!media) {
      media = new Audio();
      media.crossOrigin = "anonymous";
      media.preload = "auto";
    }
    const a = media;
    const tick = () => setT(a.currentTime);
    const end = () => setI((x) => x + 1);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", end);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", end);
    };
  }, []);

  const track = tracks.length ? tracks[((i % tracks.length) + tracks.length) % tracks.length] : null;
  const start = useCallback(() => {
    if (!media || !track) return;
    if (!tapped) {
      try {
        tapMediaElement(media);
        tapped = true;
      } catch {
        /* already tapped or unsupported */
      }
    }
    if (!media.src.endsWith(track.file)) media.src = track.file;
    void media.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [track]);

  // start as soon as the headphones are picked up, and on track change
  useEffect(() => {
    if (track) start();
  }, [track, start]);

  // live spectrum: soft rounded bars
  useEffect(() => {
    let raf = 0;
    const an = getAnalyser();
    const buf = an ? new Uint8Array(an.frequencyBinCount) : null;
    const lvl = new Float32Array(18);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = wave.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      const w = (c.width = c.clientWidth * 2);
      const h = (c.height = c.clientHeight * 2);
      if (an && buf) an.getByteFrequencyData(buf);
      g.clearRect(0, 0, w, h);
      const n = lvl.length;
      const bw = w / n;
      for (let i = 0; i < n; i++) {
        const lo = Math.floor(Math.pow(i / n, 1.8) * 120) + 1;
        const v = buf ? buf[lo] / 255 : 0;
        lvl[i] += (v - lvl[i]) * (v > lvl[i] ? 0.5 : 0.12);
        const bh = Math.max(h * 0.12, lvl[i] * h * 0.95);
        g.fillStyle = "rgba(255,255,255,0.88)";
        const x = i * bw + bw * 0.22;
        const r = Math.min(bw * 0.28, bh / 2);
        g.beginPath();
        g.roundRect(x, (h - bh) / 2, bw * 0.56, bh, r);
        g.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = track?.duration ?? 1;
  const bar = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const el = bar.current;
    if (!el || !media) return;
    const r = el.getBoundingClientRect();
    media.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
  };
  const glass =
    "border border-white/30 bg-white/16 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55),inset_0_1px_0_rgb(255_255_255/0.45),inset_0_-1px_0_rgb(255_255_255/0.08)] backdrop-blur-2xl backdrop-saturate-[1.8]";
  const icon = "press pointer-events-auto grid place-items-center rounded-full text-white/90 transition-colors hov:hover:bg-white/15 hov:hover:text-white";
  return (
    <>
      <TopBar title="Music" hint="Headphones on" onExit={onExit} />
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-3"
        initial={{ opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.94 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        <div className={`${glass} pointer-events-auto w-full max-w-[600px] rounded-[28px] p-3 text-white`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3.5">
            <AnimatePresence mode="popLayout" initial={false}>
              {track && (
                <motion.img
                  key={track.cover}
                  src={track.cover}
                  alt=""
                  className="h-[60px] w-[60px] shrink-0 rounded-[14px] object-cover shadow-[0_10px_24px_-8px_rgb(0_0_0/0.6)]"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: playing ? 1 : 0.92 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26 }}
                />
              )}
            </AnimatePresence>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold tracking-[-0.01em] [text-shadow:0_1px_8px_rgb(0_0_0/0.25)]">{track?.title ?? "Loading…"}</div>
              <div className="truncate text-[12px] text-white/70">{track?.artist}</div>
            </div>
            <canvas ref={wave} className="h-8 w-[88px] shrink-0" aria-hidden />
            <div className="flex items-center">
              <button type="button" aria-label="Previous" className={`${icon} h-9 w-9`} onClick={() => setI((x) => x - 1)}>
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                className={`${icon} h-11 w-11`}
                onClick={() => {
                  if (!media) return;
                  if (playing) {
                    media.pause();
                    setPlaying(false);
                  } else start();
                }}
              >
                {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
              </button>
              <button type="button" aria-label="Next" className={`${icon} h-9 w-9`} onClick={() => setI((x) => x + 1)}>
                <SkipForward size={18} fill="currentColor" />
              </button>
            </div>
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 px-1 text-[10.5px] font-medium tabular-nums text-white/65">
            <span className="w-8">{fmt(t)}</span>
            <div
              ref={bar}
              className="group relative h-4 flex-1 cursor-pointer"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                seek(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.buttons) seek(e.clientX);
              }}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={dur}
              aria-valuenow={Math.round(t)}
            >
              <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full bg-white/22 transition-[height] group-hover:h-[7px]">
                <div className="h-full rounded-full bg-white/90" style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} />
              </div>
            </div>
            <span className="w-8 text-right">{fmt(dur)}</span>
          </div>
          {tracks.length > 1 && (
            <div className="mt-2 flex gap-1.5 px-0.5">
              {tracks.map((tr, k) => {
                const on = track?.id === tr.id;
                return (
                  <button
                    key={tr.id}
                    type="button"
                    onClick={() => setI(k)}
                    className={`press pointer-events-auto flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[11.5px] font-medium transition-colors ${on ? "bg-white/85 text-black" : "bg-white/10 text-white/80 hov:hover:bg-white/18"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tr.cover} alt="" className="h-5 w-5 rounded-full object-cover" />
                    <span className="truncate">{tr.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ---------- book ----------

export function BookUI({ info, onExit, onPrev, onNext, onApp }: { info: { spread: number; spreads: number; ready: boolean }; onExit: () => void; onPrev: () => void; onNext: () => void; onApp: () => void }) {
  return (
    <>
      <TopBar title="Žiemos naktys šviesesnės" hint="Click a page or use ← →" exitLabel="Close book" onExit={onExit} />
      <Bottom>
        <div className={`${pill} pointer-events-auto flex items-center gap-1 p-1`} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onPrev} aria-label="Previous page">
            ←
          </button>
          <span className="min-w-[72px] text-center text-[12px] tabular-nums text-white/70">{info.ready ? `${info.spread + 1} / ${info.spreads}` : "Opening…"}</span>
          <button type="button" className={btn} onClick={onNext} aria-label="Next page">
            →
          </button>
          <span className="mx-1 h-4 w-px bg-white/20" />
          <button type="button" className={btn} onClick={onApp}>
            Read in the Novel app
          </button>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.epub" download>
            EPUB
          </a>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.pdf" download>
            PDF
          </a>
        </div>
      </Bottom>
    </>
  );
}

// ---------- sketch ----------

export function SketchUI({ onExit, onClear, onSave }: { onExit: () => void; onClear: () => void; onSave: () => void }) {
  return (
    <>
      <TopBar title="Sketchbook" hint="Draw on the page" onExit={onExit} />
      <Bottom>
        <div className={`${pill} pointer-events-auto flex items-center gap-1 p-1`} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onClear}>
            Clear
          </button>
          <button type="button" className={btn} onClick={onSave}>
            Save PNG
          </button>
        </div>
      </Bottom>
    </>
  );
}

// ---------- flight ----------

export function FlightUI({ onLand, mobile }: { onLand: () => void; mobile: boolean }) {
  return (
    <>
      <TopBar title="Paper plane" hint={mobile ? "Drag to steer" : "Steer with the mouse or W A S D · fly through the streaks"} exitLabel="Land" onExit={onLand} />
    </>
  );
}

// ---------- navigation + time of day ----------

const fmtH = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// A small Liquid Glass bar, bottom left: Orbit / Explore, Back to desk, and a
// time-of-day scrubber that previews the sky (Live snaps back to the clock).
export function NavBar({
  nav,
  onNav,
  onBack,
  hours,
  live,
  onTime,
  onLive,
  label,
}: {
  nav: "orbit" | "explore";
  onNav: (n: "orbit" | "explore") => void;
  onBack: () => void;
  hours: number;
  live: boolean;
  onTime: (h: number) => void;
  onLive: () => void;
  label: string;
}) {
  const seg = (on: boolean) =>
    `press pointer-events-auto h-7 rounded-full px-3 text-[12px] font-medium transition-colors ${on ? "bg-white/85 text-black shadow-[0_1px_6px_rgb(0_0_0/0.18)]" : "text-white/85 hov:hover:text-white"}`;
  return (
    <motion.div
      className="pointer-events-none absolute bottom-5 left-4 z-30 max-sm:bottom-auto max-sm:left-3 max-sm:top-14"
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-[18px] border border-white/25 bg-white/14 p-1.5 text-white shadow-[0_10px_40px_-12px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.35)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="flex items-center gap-1">
          <div className="flex rounded-full bg-black/20 p-0.5">
            <button type="button" className={seg(nav === "orbit")} onClick={() => onNav("orbit")}>
              Orbit
            </button>
            <button type="button" className={seg(nav === "explore")} onClick={() => onNav("explore")}>
              Explore
            </button>
          </div>
          <AnimatePresence>
            {nav === "explore" && (
              <motion.button
                type="button"
                className="press pointer-events-auto h-7 rounded-full bg-black/20 px-3 text-[12px] font-medium text-white/90 hov:hover:text-white"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                onClick={onBack}
              >
                Back to desk
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 px-1.5 pb-0.5">
          <span className="w-10 text-[11px] font-semibold tabular-nums">{fmtH(hours)}</span>
          <input
            type="range"
            min={0}
            max={23.98}
            step={0.05}
            value={hours}
            onChange={(e) => onTime(+e.target.value)}
            className="h-1 w-36 cursor-pointer accent-white"
            aria-label="Time of day"
          />
          <button
            type="button"
            className={`press pointer-events-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${live ? "bg-white/85 text-black" : "bg-black/25 text-white/85 hov:hover:text-white"}`}
            onClick={onLive}
          >
            {live ? "Live" : "Go live"}
          </button>
        </div>
        <div className="px-2 pb-0.5 text-[10px] text-white/60">{nav === "explore" ? "Drag to look · W A S D to move · scroll to fly forward" : label}</div>
      </div>
    </motion.div>
  );
}
