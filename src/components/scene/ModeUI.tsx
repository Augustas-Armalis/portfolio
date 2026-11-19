"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { getAnalyser, music, onMuteChange, sceneMuted, setSceneMuted, voice, voicePlayUrl, voiceStop } from "@/lib/audio";
import { QUALITY_LABELS, setQualityChoice, setQualityOverride, useQuality, useQualityChoice, type QualityChoice } from "@/lib/quality";
import { play } from "@/lib/sfx";
import { STATIONS } from "./flightPath";
import { GLASS_IN, GLASS_ON, GLASS_SPRING, Glass } from "./Glass";

// DOM controls for the focused desk modes. Quiet, glassy, dark-on-light pills
// that sit over the 3D scene. Every mode has the same exit: Esc or "Put down".

const EASE = [0.22, 1, 0.36, 1] as const;
const btn = "lg-btn pointer-events-auto h-8 px-3.5 text-[13px] font-medium text-white/92";

// The top capsule every mode shares: what you're holding, a hint, and the way out.
export function TopBar({ title, hint, exitLabel = "Put down", onExit }: { title: string; hint?: string; exitLabel?: string; onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
      <Glass
        className="flex items-center gap-1 p-1 pl-4"
        initial={{ ...GLASS_IN, y: -10 }}
        animate={GLASS_ON}
        exit={{ ...GLASS_IN, y: -10 }}
        transition={GLASS_SPRING}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[13px] font-semibold tracking-[-0.02em]">{title}</span>
        {hint && <span className="ml-2 hidden text-[12.5px] text-white/65 sm:inline">{hint}</span>}
        <button type="button" className={`${btn} lg-chip ml-2`} onClick={(e) => (e.stopPropagation(), onExit())}>
          {exitLabel}
          <span className="ml-1.5 text-white/50">Esc</span>
        </button>
      </Glass>
    </div>
  );
}

function Bottom({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4"
      initial={GLASS_IN}
      animate={GLASS_ON}
      exit={GLASS_IN}
      transition={{ ...GLASS_SPRING, delay: 0.06 }}
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
    // ---------- music ----------

type Track = { id: string; title: string; artist: string; file: string; cover: string; duration: number };
// The headphones' voice in the audio manager (lib/audio.ts): one element for
// the whole session, owner "headphones". Starting it fades any other music
// out; the manager fades it out when the plane takes off or the OS boots.
const headphones = () => voice("headphones", { channel: "music", owner: "headphones", scene: true });

// Now playing, as one Liquid Glass capsule: artwork, title, a live waveform,
// previous / play / next, and a scrubber along the bottom.
export function MusicUI({ onExit }: { onExit: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const wave = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/content/music/tracks.json")
      .then((r) => r.json())
      .then((d: Track[]) => setTracks(d))
      .catch(() => {});
    const v = headphones();
    if (!v) return;
    const a = v.el;
    const tick = () => setT(a.currentTime);
    const end = () => setI((x) => x + 1);
    const meta = () => setLen(Number.isFinite(a.duration) ? a.duration : 0);
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    setPlaying(!a.paused);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", end);
    a.addEventListener("loadedmetadata", meta);
    a.addEventListener("playing", on);
    a.addEventListener("pause", off);
    // the mute pill pauses the headphones: nothing plays unheard
    const unmute = onMuteChange(() => {
      if (sceneMuted()) voiceStop(v, 0.3);
    });
    return () => {
      // put down: fade out, then pause
      voiceStop(v, 0.9);
      unmute();
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", end);
      a.removeEventListener("loadedmetadata", meta);
      a.removeEventListener("playing", on);
      a.removeEventListener("pause", off);
    };
  }, []);

  const track = tracks.length ? tracks[((i % tracks.length) + tracks.length) % tracks.length] : null;
  const start = useCallback(() => {
    if (!track) return;
    // the same file carries on where it is; another one is swapped in under a short dip
    voicePlayUrl(headphones(), track.file, { fade: 0.5 });
  }, [track]);

  // start as soon as the headphones are picked up, and on track change
  // (not while the world is muted: Play asks for sound again)
  useEffect(() => {
    if (track && !sceneMuted()) start();
  }, [track, start]);

  // live waveform: mirrored rounded bars; a slow idle ripple when nothing plays
  useEffect(() => {
    let raf = 0;
    const an = getAnalyser();
    const buf = an ? new Uint8Array(an.frequencyBinCount) : null;
    const N = 30;
    const lvl = new Float32Array(N);
    let cw = 0;
    let ch = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const c = wave.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (!w || !h) return;
      if (w !== cw || h !== ch) {
        c.width = cw = w;
        c.height = ch = h;
      }
      const g = c.getContext("2d")!;
      const live = music.playing && an && buf;
      if (live) an.getByteFrequencyData(buf);
      g.clearRect(0, 0, w, h);
      const step = w / N;
      const bw = Math.max(2 * dpr, step * 0.46);
      for (let k = 0; k < N; k++) {
        // centre-out: the middle bars carry the low end
        const m = Math.abs(k - (N - 1) / 2) / ((N - 1) / 2);
        const bin = 2 + Math.floor(Math.pow(m, 1.5) * 110);
        const v = live ? Math.pow(buf[bin] / 255, 1.25) * (1 - m * 0.25) : 0.1 + 0.07 * Math.sin(now / 520 + k * 0.55);
        lvl[k] += (v - lvl[k]) * (v > lvl[k] ? 0.55 : 0.14);
        const bh = Math.max(bw, lvl[k] * h * 0.96);
        g.fillStyle = `rgba(255,255,255,${(0.55 + 0.45 * lvl[k]).toFixed(3)})`;
        g.beginPath();
        g.roundRect(k * step + (step - bw) / 2, (h - bh) / 2, bw, bh, bw / 2);
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = len || track?.duration || 1;
  const bar = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const el = bar.current;
    const a = headphones()?.el;
    if (!el || !a) return;
    const r = el.getBoundingClientRect();
    const to = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
    a.currentTime = to;
    setT(to);
  };
  const icon = "lg-btn pointer-events-auto grid place-items-center text-white";
  const step = (d: number) => {
    play("pop", { volume: 0.35 });
    setI((x) => x + d);
  };
  return (
    <>
      <TopBar title="Music" hint="Headphones on" onExit={onExit} />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-3">
        <Glass
          radius={34}
          className="pointer-events-auto w-full max-w-[540px] p-2.5 pb-2"
          initial={{ opacity: 0, y: 46, scale: 0.9 }}
          animate={GLASS_ON}
          exit={{ opacity: 0, y: 46, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="relative h-[58px] w-[58px] shrink-0">
              <AnimatePresence initial={false}>
                {track && (
                  <motion.img
                    key={track.cover}
                    src={track.cover}
                    alt=""
                    className="absolute inset-0 h-full w-full rounded-[18px] object-cover shadow-[0_10px_22px_-8px_rgb(0_0_0/0.6),inset_0_0_0_0.5px_rgb(255_255_255/0.3)]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: playing ? 1 : 0.9 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight tracking-[-0.025em]">{track?.title ?? "Loading"}</div>
              <div className="mt-0.5 truncate text-[12.5px] leading-tight text-white/80">{track?.artist ?? " "}</div>
            </div>
            <canvas ref={wave} className="h-9 w-[92px] shrink-0 max-[420px]:hidden" aria-hidden />
            <div className="flex shrink-0 items-center">
              <button type="button" aria-label="Previous" className={`${icon} h-9 w-9`} onClick={() => step(-1)}>
                <SkipBack size={17} fill="currentColor" strokeWidth={0} />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                className={`${icon} h-11 w-11`}
                onClick={() => {
                  if (playing) {
                    // a short fade, then pause
                    voiceStop(headphones(), 0.18);
                    setPlaying(false);
                  } else {
                    if (sceneMuted()) setSceneMuted(false);
                    start();
                  }
                }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={playing ? "pause" : "play"}
                    className="grid place-items-center"
                    initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  >
                    {playing ? <Pause size={24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <button type="button" aria-label="Next" className={`${icon} h-9 w-9`} onClick={() => step(1)}>
                <SkipForward size={17} fill="currentColor" strokeWidth={0} />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 px-1.5 text-[11px] font-medium tabular-nums text-white/70">
            <span className="w-8">{fmt(t)}</span>
            <div
              ref={bar}
              className="group relative h-5 flex-1 cursor-pointer touch-none"
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
              aria-valuemax={Math.round(dur)}
              aria-valuenow={Math.round(t)}
            >
              <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/24 shadow-[inset_0_0.5px_1px_rgb(0_0_0/0.25)] transition-[height] duration-200 group-hover:h-[7px] group-active:h-[7px]">
                <div className="h-full origin-left rounded-full bg-white" style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} />
              </div>
            </div>
            <span className="w-8 text-right">{fmt(dur)}</span>
          </div>
        </Glass>
      </div>
    </>
  );
}

     </Glass>
      </div>
    </>
  );
}

// ---------- book ----------

export function BookUI({ info, onExit, onPrev, onNext, onApp }: { info: { spread: number; spreads: number; ready: boolean }; onExit: () => void; onPrev: () => void; onNext: () => void; onApp: () => void }) {
  return (
    <>
      <TopBar title="Žiemos naktys šviesesnės" hint="Click or drag a page, or use ← →" exitLabel="Close book" onExit={onExit} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-1 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onPrev} aria-label="Previous page">
            ←
          </button>
          <span className="min-w-[72px] text-center text-[12px] tabular-nums text-white/70">{info.ready ? `${info.spread + 1} / ${info.spreads}` : "Opening…"}</span>
          <button type="button" className={btn} onClick={onNext} aria-label="Next page">
            →
          </button>
          <span className="mx-1 h-4 w-px bg-white/25" />
          <button type="button" className={btn} onClick={onApp}>
            Read in the Novel app
          </button>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.epub" download>
            EPUB
          </a>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.pdf" download>
            PDF
          </a>
        </Glass>
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
        <Glass className="pointer-events-auto flex items-center gap-1 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onClear}>
            Clear
          </button>
          <button type="button" className={btn} onClick={onSave}>
            Save PNG
          </button>
        </Glass>
      </Bottom>
    </>
  );
}

// ---------- flight ----------

export function FlightUI({ onLand, mobile, free, onFree, station }: { onLand: () => void; mobile: boolean; free: boolean; onFree: (f: boolean) => void; station: number }) {
  const seg = (on: boolean) => `lg-btn pointer-events-auto h-7 px-3 text-[12.5px] font-medium ${on ? "lg-on" : "text-white/90"}`;
  const s = station >= 0 && station < STATIONS.length ? STATIONS[station] : null;
  const sea = station === STATIONS.length;
  return (
    <>
      <TopBar title="Paper plane" hint={mobile ? "Drag to lean" : free ? "Mouse or W A S D to steer" : "Mouse or arrows to lean · it follows the road"} exitLabel="Land" onExit={onLand} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-0.5 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={seg(!free)} onClick={() => onFree(false)}>
            Follow the road
          </button>
          <button type="button" className={seg(free)} onClick={() => onFree(true)}>
            Free flight
          </button>
        </Glass>
      </Bottom>
      {/* where you are: the painting this stretch of the road is built from */}
      <div className="pointer-events-none absolute bottom-6 left-5 z-30 max-sm:bottom-20 max-sm:left-3">
        <AnimatePresence mode="wait">
          {(s || sea) && (
            <Glass key={s?.id ?? "sea"} radius={22} lens={false} className="px-4 py-2.5" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING}>
              <div className="text-[15px] font-semibold leading-tight tracking-[-0.03em]">{s ? s.title : "Tranquility"}</div>
              <div className="mt-0.5 text-[12.5px] leading-tight text-white/70">M. K. Čiurlionis, {s ? s.year : "1904"}</div>
            </Glass>
          )}
        </AnimatePresence>
      </div>
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
  const seg = (on: boolean) => `lg-btn pointer-events-auto h-7 px-3 text-[12.5px] font-medium ${on ? "lg-on" : "text-white/90"}`;
  const [gfx, setGfx] = useState(false);
  const choice = useQualityChoice();
  const quality = useQuality();
  return (
    <div className="pointer-events-none absolute bottom-5 left-4 z-30 max-sm:bottom-auto max-sm:left-3 max-sm:top-14">
      <Glass
        radius={22}
        className="pointer-events-auto flex flex-col gap-1.5 p-1.5"
        initial={GLASS_IN}
        animate={GLASS_ON}
        exit={GLASS_IN}
        transition={GLASS_SPRING}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <div className="flex rounded-full bg-black/18 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]">
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
                className="lg-btn lg-chip pointer-events-auto h-7 px-3 text-[12.5px] font-medium text-white/92"
                initial={{ opacity: 0, x: -6, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.94 }}
                transition={GLASS_SPRING}
                onClick={onBack}
              >
                Back to desk
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 px-1.5 pb-0.5">
          <span className="w-10 text-[12px] font-semibold tabular-nums">{fmtH(hours)}</span>
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
            className={`lg-btn pointer-events-auto px-2 py-0.5 text-[11.5px] font-semibold ${live ? "lg-on" : "lg-chip text-white/90"}`}
            onClick={onLive}
          >
            {live ? "Live" : "Go live"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pb-0.5 text-[11px] text-white/65">
          <span>{nav === "explore" ? "Drag to look · W A S D to move · scroll to fly forward" : label}</span>
          <button type="button" className="lg-btn pointer-events-auto -mr-1 px-1.5 py-0.5 text-[11px] font-medium text-white/85" aria-expanded={gfx} onClick={() => setGfx((g) => !g)}>
            Graphics · {QUALITY_LABELS[choice]}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {gfx && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={GLASS_SPRING} className="overflow-hidden">
              <div className="flex flex-col gap-1.5 px-1 pb-1 pt-0.5">
                <div className="flex rounded-full bg-black/18 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]">
                  {(["auto", "low", "medium", "high", "ultra"] as QualityChoice[]).map((c) => (
                    <button key={c} type="button" className={`lg-btn pointer-events-auto h-6 flex-1 px-2 text-[11.5px] font-medium ${choice === c ? "lg-on" : "text-white/90"}`} onClick={() => setQualityChoice(c)}>
                      {QUALITY_LABELS[c]}
                    </button>
                  ))}
                </div>
                {(
                  [
                    ["Resolution", "resolution", (quality.dpr - 0.75) / 1.25],
                    ["Grass", "grass", (quality.grass - 0.2) / 1.3],
                    ["Effects", "effects", quality.effects],
                  ] as [string, "resolution" | "grass" | "effects", number][]
                ).map(([name, key, v]) => (
                  <label key={key} className="flex items-center gap-2 px-1 text-[11.5px] text-white/80">
                    <span className="w-[68px]">{name}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      defaultValue={Math.min(1, Math.max(0, v))}
                      key={`${key}-${choice}-${quality.preset}`}
                      onPointerUp={(e) => setQualityOverride(key, +(e.target as HTMLInputElement).value)}
                      onKeyUp={(e) => setQualityOverride(key, +(e.target as HTMLInputElement).value)}
                      className="h-1 flex-1 cursor-pointer accent-white"
                      aria-label={name}
                    />
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>
    </div>
  );
}
