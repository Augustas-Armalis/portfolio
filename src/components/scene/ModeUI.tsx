"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // live waveform
  useEffect(() => {
    let raf = 0;
    const an = getAnalyser();
    const buf = an ? new Uint8Array(an.fftSize) : null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = wave.current;
      if (!c || !an || !buf) return;
      const g = c.getContext("2d")!;
      const w = (c.width = c.clientWidth * 2);
      const h = (c.height = c.clientHeight * 2);
      an.getByteTimeDomainData(buf);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.85)";
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < w; x++) {
        const v = buf[Math.floor((x / w) * buf.length)] / 128 - 1;
        const y = h / 2 + v * h * 0.9;
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = track?.duration ?? 1;
  return (
    <>
      <TopBar title="Music" hint="Headphones on" onExit={onExit} />
      <Bottom>
        <div className={`${pill} pointer-events-auto flex w-full max-w-[560px] items-center gap-3 rounded-[22px] p-2.5 pr-4`} onClick={(e) => e.stopPropagation()}>
          {track && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.cover} alt="" className="h-12 w-12 shrink-0 rounded-[10px] object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{track?.title ?? "Loading…"}</div>
                <div className="truncate text-[11px] text-white/60">{track?.artist}</div>
              </div>
              <canvas ref={wave} className="h-6 w-24 shrink-0 opacity-80" />
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] tabular-nums text-white/60">
              <span>{fmt(t)}</span>
              <input
                type="range"
                min={0}
                max={dur}
                step={0.1}
                value={Math.min(t, dur)}
                onChange={(e) => {
                  if (media) media.currentTime = +e.target.value;
                }}
                className="h-1 flex-1 cursor-pointer accent-white"
                aria-label="Seek"
              />
              <span>{fmt(dur)}</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" aria-label="Previous" className={`${btn} px-2.5`} onClick={() => setI((x) => x - 1)}>
              ‹‹
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              className={`${btn} grid h-9 w-9 place-items-center bg-white px-0 text-black hov:hover:bg-white hov:hover:text-black`}
              onClick={() => {
                if (!media) return;
                if (playing) {
                  media.pause();
                  setPlaying(false);
                } else start();
              }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button type="button" aria-label="Next" className={`${btn} px-2.5`} onClick={() => setI((x) => x + 1)}>
              ››
            </button>
          </div>
        </div>
      </Bottom>
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
