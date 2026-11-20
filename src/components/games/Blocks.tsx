"use client";

// Blocks: a small voxel sandbox. This file is the DOM HUD (hotbar, crosshair,
// start/pause card, touch controls); the game itself lives in ./engine.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { BLOCKS, PLACEABLE } from "./blockTypes";
import { BlocksGame } from "./engine";
import { blockIconURL, createAtlasCanvas } from "./textures";

const GLASS_RING = "shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.25)]";
const STICK_RADIUS = 38;

/** Virtual joystick. Reports a vector in [-1, 1], y pointing down the screen. */
function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null);

  const place = (x: number, y: number) => {
    if (knob.current) knob.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    onMove(x / STICK_RADIUS, y / STICK_RADIUS);
  };

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    let dx = e.clientX - a.cx;
    let dy = e.clientY - a.cy;
    const length = Math.hypot(dx, dy);
    if (length > STICK_RADIUS) {
      dx = (dx / length) * STICK_RADIUS;
      dy = (dy / length) * STICK_RADIUS;
    }
    place(dx, dy);
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    place(0, 0);
  };

  return (
    <div
      aria-label="Move"
      className={`relative flex h-[120px] w-[120px] touch-none items-center justify-center rounded-full bg-white/10 backdrop-blur-md ${GLASS_RING}`}
      onPointerDown={(e) => {
        if (active.current) return;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // a pointer that is already gone: carry on without capture
        }
        const rect = e.currentTarget.getBoundingClientRect();
        active.current = { id: e.pointerId, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
        track(e);
      }}
      onPointerMove={track}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div ref={knob} className="h-[52px] w-[52px] rounded-full bg-white/35 shadow-[0_2px_10px_rgb(0_0_0/0.25)] will-change-transform" />
    </div>
  );
}

/** A round touch button that reports press and release. */
function HoldButton({ label, className, onHold }: { label: string; className: string; onHold: (held: boolean) => void }) {
  const end = () => onHold(false);
  return (
    <button
      type="button"
      className={`absolute flex touch-none items-center justify-center rounded-full bg-white/15 text-[12px] font-semibold tracking-[0.01em] text-white/90 backdrop-blur-md transition-colors duration-100 [-webkit-touch-callout:none] active:bg-white/30 ${GLASS_RING} ${className}`}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // a pointer that is already gone: carry on without capture
        }
        onHold(true);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      {label}
    </button>
  );
}

export default function Blocks({ compact = false }: { compact?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<BlocksGame | null>(null);
  const lookPointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const confirmTimer = useRef<number | null>(null);

  // null until we have looked at the device (never read window during render).
  const [coarse, setCoarse] = useState<boolean | null>(null);
  const [icons, setIcons] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [selectTick, setSelectTick] = useState(0);
  const [nameVisible, setNameVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [submerged, setSubmerged] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [failed, setFailed] = useState(false);

  const touch = compact || coarse === true;

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (coarse === null || !mount) return;
    let game: BlocksGame;
    try {
      const atlas = createAtlasCanvas();
      setIcons(PLACEABLE.map((id) => blockIconURL(atlas, id)));
      game = new BlocksGame(
        mount,
        atlas,
        { touch, renderDistance: compact ? 3 : 5 },
        {
          onPlayingChange: (now) => {
            setPlaying(now);
            if (now) setStarted(true);
          },
          onSelect: (slot) => {
            setSelected(slot);
            setSelectTick((t) => t + 1);
          },
          onSubmerged: setSubmerged,
        },
      );
    } catch {
      setFailed(true);
      return;
    }
    gameRef.current = game;
    return () => {
      game.dispose();
      gameRef.current = null;
      setPlaying(false);
      setSubmerged(false);
    };
  }, [coarse, touch, compact]);

  // Show the selected block's name for a moment after each change.
  useEffect(() => {
    if (selectTick === 0) return;
    setNameVisible(true);
    const timer = window.setTimeout(() => setNameVisible(false), 1200);
    return () => window.clearTimeout(timer);
  }, [selectTick]);

  useEffect(
    () => () => {
      if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const play = useCallback(() => {
    // Drop focus so Space (jump) can never re-press a button.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    gameRef.current?.play();
  }, []);

  const newWorld = () => {
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = null;
    if (!confirmErase) {
      setConfirmErase(true);
      confirmTimer.current = window.setTimeout(() => setConfirmErase(false), 3000);
      return;
    }
    setConfirmErase(false);
    setStarted(false);
    gameRef.current?.newWorld();
  };

  const endLook = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointer.current?.id === e.pointerId) lookPointer.current = null;
  };

  // Everything sits above the iOS home indicator on touch devices.
  // (on the phone that strip is --phone-bottom; a touch screen with a desktop window has only the safe area)
  const indicator = "var(--phone-bottom, calc(env(safe-area-inset-bottom, 0px) + 34px))";
  const hotbarBottom = touch ? `calc(${indicator} + 6px)` : "16px";
  const controlsBottom = `calc(${indicator} + 74px)`;
  const nameBottom = touch ? `calc(${indicator} + 70px)` : "80px";

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden bg-black select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={mountRef} className="absolute inset-0" />

      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-[#2a5d66]/35 transition-opacity duration-300 motion-reduce:transition-none ${submerged ? "opacity-100" : "opacity-0"}`}
      />

      {touch && (
        <div
          className="absolute inset-0 z-10 touch-none"
          onPointerDown={(e) => {
            if (lookPointer.current) return;
            try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // a pointer that is already gone: carry on without capture
        }
            lookPointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const p = lookPointer.current;
            if (!p || p.id !== e.pointerId) return;
            gameRef.current?.look(e.clientX - p.x, e.clientY - p.y);
            p.x = e.clientX;
            p.y = e.clientY;
          }}
          onPointerUp={endLook}
          onPointerCancel={endLook}
          onLostPointerCapture={endLook}
        />
      )}

      {/* Crosshair */}
      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-1/2 z-10 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200 motion-reduce:transition-none ${playing ? "opacity-100" : "opacity-0"}`}
      >
        <div className="absolute left-1/2 top-0 h-full w-[1.5px] -translate-x-1/2 rounded-full bg-white/85 shadow-[0_0_2px_rgb(0_0_0/0.5)]" />
        <div className="absolute left-0 top-1/2 h-[1.5px] w-full -translate-y-1/2 rounded-full bg-white/85 shadow-[0_0_2px_rgb(0_0_0/0.5)]" />
      </div>

      {touch && (
        <>
          <div className="absolute left-4 z-20" style={{ bottom: controlsBottom }}>
            <Joystick onMove={(x, y) => gameRef.current?.setStick(x, y)} />
          </div>
          <div className="absolute right-4 z-20 h-[128px] w-[132px]" style={{ bottom: controlsBottom }}>
            <HoldButton label="Place" className="right-1 top-0 h-14 w-14" onHold={(held) => gameRef.current?.setPlacing(held)} />
            <HoldButton label="Break" className="bottom-1 left-0 h-14 w-14" onHold={(held) => gameRef.current?.setBreaking(held)} />
            <HoldButton label="Jump" className="bottom-0 right-0 h-16 w-16" onHold={(held) => gameRef.current?.setJump(held)} />
          </div>
          <button
            type="button"
            aria-label="Pause"
            onClick={() => gameRef.current?.pause()}
            className={`absolute z-20 flex h-9 w-9 items-center justify-center gap-[4px] rounded-full bg-black/35 backdrop-blur-xl transition-opacity duration-200 active:bg-black/50 ${GLASS_RING} ${
              compact ? "left-4 top-[calc(var(--phone-top)+8px)]" : "right-3 top-3"
            } ${playing ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            <span className="h-3 w-[3px] rounded-full bg-white/90" />
            <span className="h-3 w-[3px] rounded-full bg-white/90" />
          </button>
        </>
      )}

      {/* Selected block name */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center transition-opacity duration-300 motion-reduce:transition-none ${nameVisible && playing ? "opacity-100" : "opacity-0"}`}
        style={{ bottom: nameBottom }}
      >
        <span className="rounded-full bg-black/35 px-3 py-1 text-[13px] font-medium tracking-[-0.01em] text-white/95 backdrop-blur-xl">
          {BLOCKS[PLACEABLE[selected]].name}
        </span>
      </div>

      {/* Hotbar */}
      <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ bottom: hotbarBottom }}>
        <div className={`pointer-events-auto flex gap-1 rounded-[22px] bg-black/35 p-1.5 backdrop-blur-xl ${GLASS_RING}`}>
          {PLACEABLE.map((id, slot) => (
            <button
              key={id}
              type="button"
              aria-label={BLOCKS[id].name}
              aria-pressed={slot === selected}
              onClick={() => gameRef.current?.select(slot)}
              className={`h-10 w-10 rounded-[16px] bg-white/10 bg-cover [image-rendering:pixelated] transition-transform duration-150 ease-out motion-reduce:transition-none ${
                slot === selected ? "scale-[1.08] ring-2 ring-white" : "ring-0"
              }`}
              style={icons[slot] ? { backgroundImage: `url(${icons[slot]})` } : undefined}
            />
          ))}
        </div>
      </div>

      {/* Start / pause card over the dimmed world */}
      <div
        inert={playing}
        onClick={failed ? undefined : play}
        className={`absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-5 transition-opacity duration-200 motion-reduce:transition-none ${
          playing ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex w-full max-w-[380px] flex-col items-center rounded-[28px] bg-black/30 px-8 pb-7 pt-9 text-center backdrop-blur-2xl ${GLASS_RING}`}
        >
          <h2 className="text-[34px] font-bold leading-[41px] tracking-[-0.02em] text-white">Blocks</h2>
          <p className="mt-1 text-[15px] leading-5 text-white/70">A small world to build in.</p>
          {failed ? (
            <p className="mt-6 text-[13px] leading-[18px] text-white/60">This device could not start WebGL, which Blocks needs.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={play}
                className="mt-6 h-11 min-w-[140px] rounded-full bg-white px-8 text-[15px] font-semibold text-black transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none"
              >
                {started ? "Resume" : "Play"}
              </button>
              <button
                type="button"
                onClick={newWorld}
                className={`mt-1.5 h-9 rounded-full px-4 text-[13px] font-medium transition-colors duration-150 ${
                  confirmErase ? "text-[#ff8f85]" : "text-white/65 hover:text-white"
                }`}
              >
                {confirmErase ? "Tap again to erase" : "New world"}
              </button>
              <p className="mt-5 text-[12px] leading-[18px] text-white/45">
                {touch
                  ? "Stick move · Drag look · Tap a block to select"
                  : "WASD move · Space jump · Click break · Right click place · 1-8 blocks · Esc pause"}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
