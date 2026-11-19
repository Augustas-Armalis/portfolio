"use client";

// Piano.

import { useEffect, useRef, useState } from "react";
import { note } from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";
import { useOS } from "@/store";
import { Segmented, Toolbar, useChrome } from "../ui";

const KEYS = "awsedftgyhujkolp;'".split("");

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const noteName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

export function PianoApp() {
  const { compact } = useChrome();
  const setPlaying = useOS((s) => s.setPlaying);
  const [downs, setDowns] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [oct, setOct] = useState<"3" | "4" | "5">("4");
  const timer = useRef<number | undefined>(undefined);
  // the phone shows one octave at a size a thumb can play, with the octave on a switch; the Mac shows two
  const base = compact ? 12 * (Number(oct) + 1) : 60;
  const notes = Array.from({ length: compact ? 13 : 25 }, (_, i) => base + i);
  const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  const whites = notes.filter((m) => !isBlack(m));

  // real sampled piano (Salamander); the synth only covers a note whose sample can't play
  useEffect(() => preloadPiano(base, base + 24), [base]);
  const hit = (m: number) => {
    if (useOS.getState().sound && !playPiano(m, { vel: 0.7, dur: 2.4 })) note(m);
    setLast(m);
    setPlaying("Piano");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPlaying(null), 1800);
  };

  // every finger (or the mouse) holds one key; sliding onto another key plays it, so a glissando works
  const held = useRef(new Map<number | string, number>());
  const sync = () => setDowns([...held.current.values()]);
  const press = (who: number | string, m: number) => {
    if (held.current.get(who) === m) return;
    held.current.set(who, m);
    hit(m);
    sync();
  };
  const release = (who: number | string) => {
    if (held.current.delete(who)) sync();
  };
  const keyAt = (e: React.PointerEvent) => {
    const n = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.dataset.note;
    return n ? Number(n) : null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && i < notes.length) press(`k${i}`, base + i);
    };
    const onUp = (e: KeyboardEvent) => {
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) release(`k${i}`);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  const keyboard = (
    <div
      className="relative flex h-full touch-none select-none gap-[2px]"
      onPointerDown={(e) => {
        try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
        const m = keyAt(e);
        if (m !== null) press(e.pointerId, m);
      }}
      onPointerMove={(e) => {
        if (!held.current.has(e.pointerId)) return;
        const m = keyAt(e);
        if (m !== null) press(e.pointerId, m);
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
    >
      {whites.map((m) => (
        <button
          type="button"
          key={m}
          data-note={m}
          aria-label={noteName(m)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && hit(m)}
          className={`piano-white relative h-full flex-1 rounded-b-[7px] ${downs.includes(m) ? "is-down" : ""}`}
        >
          {compact && m % 12 === 0 && <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold text-black/35">{noteName(m)}</span>}
        </button>
      ))}
      {notes.filter(isBlack).map((m) => {
        const left = whites.filter((w) => w < m).length;
        return (
          <button
            type="button"
            key={m}
            data-note={m}
            aria-label={noteName(m)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && hit(m)}
            className={`piano-black absolute top-0 h-[60%] -translate-x-1/2 rounded-b-[5px] ${downs.includes(m) ? "is-down" : ""}`}
            style={{ left: `${(left / whites.length) * 100}%`, width: `${(100 / whites.length) * 0.6}%` }}
          />
        );
      })}
    </div>
  );

  if (compact)
    return (
      <div className="flex flex-col" style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px) - 160px)" }}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="text-[72px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink" aria-live="polite">
            {last !== null ? noteName(last) : "♪"}
          </div>
          <div className="t-sub mt-3 text-ink-2">{last !== null ? "Slide across the keys" : "Tap a key, or slide across them"}</div>
        </div>
        <div className="flex justify-center pb-4">
          <Segmented
            id="piano-octave"
            value={oct}
            onChange={setOct}
            options={[
              { value: "3", label: "Low" },
              { value: "4", label: "Middle" },
              { value: "5", label: "High" },
            ]}
          />
        </div>
        <div className="mx-2 h-[42%] max-h-[340px] min-h-[220px] shrink-0 rounded-[16px] bg-[#16171A] px-[6px] pb-[6px] pt-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">{keyboard}</div>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="Piano" sub={last !== null ? noteName(last) : "A – ;"} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-[#F7F7F9] p-4">
        <div className="relative min-h-[140px] flex-1 rounded-[12px] bg-[#16171A] px-2 pb-2 pt-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">{keyboard}</div>
      </div>
    </div>
  );
}

// ---------- music player: one <audio> for the whole OS, routed through the analyser ----------
