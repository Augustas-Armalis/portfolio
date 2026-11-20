"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, ChevronDown, Music2, Volume2, VolumeX } from "lucide-react";
import { TRACKS, pickTrack, setMusicMuted, setMusicOpen, setMusicVolume, useMusic } from "@/lib/musicDirector";
import { streamHost } from "@/lib/stream";
import { useOS } from "@/store";
import { TRACK, geist } from "../font";
import { GLASS_SPRING, Glass, GlassStyles } from "../Glass";

// The mini-player: what is playing, whose it is and where it comes from, in one small piece of glass. Closed it
// is a pill (the player's own frame, small, a title, its source); opened out it shows the frame larger, a volume,
// a mute, and the list of everything that can be played, each with its source and credit. A streamed recording is
// the official player, embedded: its frame is always in the page and on show while it plays.
//
// It sits at the top of the view beside the sound pill (on a phone, beside the corner button), clear of the
// controls at the foot. It lives in a root of its own (made once, on the first music of the visit) so the frames in it are never
// moved or remounted as the scene's own chrome comes and goes: a moved frame would start its recording again.

const SAFE = { t: "max(12px, env(safe-area-inset-top))", l: "max(14px, env(safe-area-inset-left))" };

function Dock() {
  const m = useMusic();
  const phase = useOS((s) => s.phase);
  const slot = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(pointer: coarse)");
    const f = () => setCoarse(q.matches || /[?&]mobile=1(&|$)/.test(window.location.search));
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  // the frames are taken in once and stay
  useLayoutEffect(() => {
    const host = streamHost();
    const park = host.parentElement;
    if (slot.current && park !== slot.current) {
      slot.current.appendChild(host);
      if (park?.dataset.streamPark !== undefined) park.remove();
    }
  }, []);
  // a click anywhere else folds it away
  useEffect(() => {
    if (!m.open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!root.current?.contains(t) && !t?.closest?.('[data-flight="music"]')) setMusicOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [m.open]);

  const show = phase === "room" && m.place !== null;
  const stream = m.kind === "yt";
  const open = m.open && show;
  const t = m.playing;
  const waiting = stream && m.state !== "playing";
  const line = m.muted ? "Music off" : !t ? "" : m.credit ? m.credit : stream ? (m.part ?? t.source) : t.by;
  const W = coarse ? "min(318px, calc(100vw - 80px))" : "326px";
  // (what this place plays by default leads the list)
  const first = m.place === "flight" ? "worlds" : "spring";
  const list = TRACKS.filter((x) => !x.flightOnly || m.place === "flight").sort((a, b) => +(b.id === first) - +(a.id === first));
  return (
    <div
      ref={root}
      className={`${geist.className} pointer-events-none fixed z-40 text-white`}
      style={{ letterSpacing: TRACK.body, ...(coarse ? { top: SAFE.t, left: `calc(${SAFE.l} + 52px)` } : { right: 60, top: 16 }) }}
      data-music-dock={open ? "open" : "closed"}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <GlassStyles sheet={false} />
      <style>{`[data-music-dock] [data-deck]{pointer-events:none}[data-music-dock="open"] [data-deck][data-live]{pointer-events:auto;z-index:2}
[data-music-dock="closed"] .md-rest{opacity:.62}[data-music-dock="closed"] .md-rest:hover,[data-music-dock="closed"] .md-rest:focus-within{opacity:1}`}</style>
      <motion.div initial={false} animate={{ opacity: show ? 1 : 0, y: show ? 0 : 8, scale: show ? 1 : 0.96 }} transition={GLASS_SPRING} style={{ pointerEvents: show ? "auto" : "none", transformOrigin: coarse ? "top left" : "top right" }} aria-hidden={!show}>
        <div className="md-rest transition-opacity duration-300">
          <Glass radius={open ? 24 : 22} lens={false} panel className="overflow-hidden" data-music="dock" transition={GLASS_SPRING}>
            <div style={{ width: open ? W : undefined }} className={open ? "flex flex-col" : "flex items-center"}>
              {/* the player's own frame: small in the pill, larger when opened out; never taken out of the page */}
              <div
                ref={slot}
                data-music="frame"
                className="relative shrink-0 overflow-hidden bg-black/40"
                style={{
                  width: open ? "100%" : stream ? 50 : 0,
                  height: open ? (stream ? undefined : 0) : stream ? 28 : 0,
                  aspectRatio: open && stream ? "16 / 9" : undefined,
                  margin: open ? 0 : stream ? "0 0 0 4px" : 0,
                  borderRadius: open ? "22px 22px 10px 10px" : 14,
                  opacity: stream ? 1 : 0,
                  transition: "border-radius .45s ease, opacity .4s ease",
                }}
              />
              <button
                type="button"
                className={`flex min-w-0 items-center gap-2 text-left ${open ? "px-3.5 pb-1 pt-2.5" : `h-9 [@media(pointer:coarse)]:h-11 ${stream ? "pl-2.5" : "pl-3.5"} pr-1`}`}
                aria-expanded={open}
                aria-label={open ? "Close the music panel" : `Music: ${t ? t.title : "nothing playing"}. Open the music panel`}
                data-music="toggle"
                onClick={() => setMusicOpen(!open)}
              >
                {!stream && !open && <Music2 size={15} strokeWidth={2} className="shrink-0 opacity-90" />}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold leading-tight tracking-[-0.02em] ${open ? "text-[14px]" : "max-w-[190px] text-[12.5px] max-sm:max-w-[104px]"}`} data-music="title">
                    {t ? t.title : "Music"}
                  </span>
                  <span className={`block truncate leading-tight text-white/72 ${open ? "mt-0.5 text-[12px]" : "max-w-[190px] text-[11px] max-sm:max-w-[104px]"}`} data-music="line">
                    {waiting && !m.muted ? "Starting…" : open && t ? `${t.by}` : line}
                  </span>
                </span>
                <ChevronDown size={15} strokeWidth={2.2} className={`mx-1.5 shrink-0 opacity-70 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={GLASS_SPRING} className="overflow-hidden">
                    <div className="px-3.5 pb-1 text-[11.5px] leading-snug text-white/70">
                      {m.part && stream ? <div>{m.part}</div> : null}
                      <div className="flex items-center gap-1.5">
                        <span className="truncate" data-music="source">
                          {m.credit ?? t?.source ?? ""}
                        </span>
                        {t?.url && stream && (
                          <a href={t.url} target="_blank" rel="noreferrer" className="lg-btn -my-0.5 inline-flex shrink-0 items-center gap-0.5 px-1.5 py-0.5 text-white/90">
                            Watch on YouTube
                            <ArrowUpRight size={11} strokeWidth={2.2} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1">
                      <button type="button" className={`lg-btn grid h-8 w-8 shrink-0 place-items-center ${m.muted ? "lg-on" : "text-white/95"}`} aria-pressed={m.muted} aria-label={m.muted ? "Turn the music on" : "Turn the music off"} data-music="mute" onClick={() => setMusicMuted(!m.muted)}>
                        {m.muted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
                      </button>
                      <input type="range" min={0} max={1} step={0.01} value={m.volume} onChange={(e) => setMusicVolume(+e.target.value)} className="lg-range mr-2 flex-1" aria-label="Music volume" data-music="volume" />
                    </div>
                    {/* the picker is the flight's: at the field there is one music, a volume and a mute */}
                    {m.place === "flight" && (
                    <div className="flex max-h-[min(46vh,296px)] flex-col gap-0.5 overflow-y-auto p-1.5 pt-0.5" role="radiogroup" aria-label="What plays" data-music="list">
                      {list.map((x) => {
                        const on = m.choice === x.id;
                        return (
                          <button key={x.id} type="button" role="radio" aria-checked={on} data-track={x.id} className={`lg-btn flex flex-col !rounded-[14px] px-2.5 py-1.5 text-left ${on ? "lg-on" : "text-white/95"}`} onClick={() => pickTrack(x.id)}>
                            <span className="text-[12.5px] font-medium leading-tight tracking-[-0.01em]">{x.title}</span>
                            <span className={`mt-0.5 text-[11px] leading-tight ${on ? "text-black/60" : "text-white/62"}`}>
                              {x.by} · {x.credit ? "CC BY 4.0" : x.source}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Glass>
        </div>
      </motion.div>
    </div>
  );
}

export function mountMusicDock() {
  if (typeof document === "undefined") return;
  // (one root for the page, found again by a reloaded module)
  const g = globalThis as typeof globalThis & { __aosDock?: ReturnType<typeof createRoot> };
  if (!g.__aosDock) {
    const el = document.createElement("div");
    el.id = "aos-music-dock";
    document.body.appendChild(el);
    g.__aosDock = createRoot(el);
  }
  g.__aosDock.render(<Dock />);
}
