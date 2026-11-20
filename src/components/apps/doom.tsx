"use client";

// DOOM (shareware) in js-dos.

import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { Sym } from "../symbols";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "../icons";
import { Btn, glass, Toolbar, useChrome } from "../ui";

// Shareware DOOM in js-dos, loaded only when the app opens.
// js-dos ships a Tailwind 3 + daisyUI stylesheet: global resets (*, ::before { --tw-translate-x: 0 }) and class
// names this OS also uses (.btn, .glass). Loaded as is, it un-centred the Dock and restyled every button the
// moment DOOM started. So its rules are confined to the player: scoped to .jsdos-host and put in the lowest
// cascade layer (declared first in globals.css). Keyframes and fonts can't live in a scope, so they stay outside.
function scopeCss(css: string, root: string) {
  const outside: string[] = [];
  const inside: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const rule = css.slice(start, i + 1);
        (/^\s*@(-webkit-)?(keyframes|font-face|property)/.test(rule) ? outside : inside).push(rule);
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) start = i + 1;
  }
  return `${outside.join("")}@layer jsdos{@scope (${root}){${inside.join("").replace(/:root/g, ":scope")}}}`;
}

let dosLoad: Promise<void> | null = null;

function loadDos() {
  if (dosLoad) return dosLoad;
  const style = document.createElement("style");
  document.head.appendChild(style);
  const css =
    typeof CSSScopeRule === "undefined"
      ? Promise.reject(new Error("no @scope"))
      : fetch("/doom/js-dos.css")
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error("css"))))
          .then((t) => void (style.textContent = scopeCss(t, ".jsdos-host")));
  dosLoad = css
    // an older browser: the layer alone still keeps the resets under the OS's own styles
    .catch(() => void (style.textContent = '@import url("/doom/js-dos.css") layer(jsdos);'))
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          const js = document.createElement("script");
          js.src = "/doom/js-dos.js";
          js.onload = () => resolve();
          js.onerror = () => reject(new Error("js-dos failed to load"));
          document.head.appendChild(js);
        }),
    );
  return dosLoad;
}

type DosCi = { sendKeyEvent: (code: number, pressed: boolean) => void };

// js-dos key codes
const DK = { up: 265, down: 264, left: 263, right: 262, fire: 341, use: 32, enter: 257, esc: 256, yes: 89 };

export function Doom() {
  const { compact } = useChrome();
  const ref = useRef<HTMLDivElement>(null);
  const ci = useRef<DosCi | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    let props: { stop?: () => unknown } | null = null;
    let dead = false;
    setState("loading");
    loadDos()
      .then(() => {
        if (dead || !ref.current) return;
        const Dos = (window as unknown as { Dos: (el: HTMLElement, o: Record<string, unknown>) => { stop?: () => unknown } }).Dos;
        props = Dos(ref.current, {
          url: "/doom/doom-shareware.jsdos",
          pathPrefix: "/doom/emulators/",
          autoStart: true,
          kiosk: true,
          noCloud: true,
          noNetworking: true,
          theme: "dark",
          // a phone has no mouse to capture; it plays from the buttons below the screen
          ...(compact ? { mouseCapture: false } : {}),
          onEvent: (e: string, c: unknown) => {
            if (e === "ci-ready") ci.current = c as DosCi;
          },
        });
        setState("idle");
      })
      .catch(() => setState("error"));
    return () => {
      dead = true;
      ci.current = null;
      try {
        props?.stop?.();
      } catch {}
    };
  }, [started, compact]);

  // a touch button holds a DOS key down for as long as the finger is on it
  const hold = (code: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      ci.current?.sendKeyEvent(code, true);
    },
    onPointerUp: () => ci.current?.sendKeyEvent(code, false),
    onPointerCancel: () => ci.current?.sendKeyEvent(code, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const pad = `${glass("btn-dark")} glass-press no-callout flex touch-none select-none items-center justify-center rounded-full text-white/90`;

  const card = !started && (
    // a title card: the icon, the name in heavy type, the episode, one clear button and how it is played
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(70%_60%_at_50%_42%,#3a0d08_0%,#120403_55%,#000_100%)] px-6 text-center">
      <AppIcon id="doom" size={88} />
      <div className="mt-6 text-[44px] font-black leading-none tracking-[0.08em] text-white">DOOM</div>
      <div className="t-sub mt-2 text-white/60">Episode 1 · Knee-Deep in the Dead</div>
      <div className="mt-6">
        <Btn variant="prominent" capsule size="lg" onClick={() => setStarted(true)} icon={<Sym icon={Play} size={16} weight="medium" fill />} className="!h-11 !bg-[#c93224] !px-7 !text-[16px]">
          Play
        </Btn>
      </div>
      {compact ? (
        <div className="t-foot mt-6 max-w-[260px] text-white/45">Shareware v1.9. Plays with the buttons under the screen; a keyboard is better.</div>
      ) : (
        <div className="m-sub mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-white/45">
          {[
            ["Arrows", "move"],
            ["Ctrl", "fire"],
            ["Space", "open"],
          ].map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <kbd className="rounded-[7px] bg-white/10 px-1.5 py-0.5 font-sans text-white/75 shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.18)]">{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
  const status = (
    <>
      {state === "loading" && <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-white/50">Loading…</div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/70">DOOM couldn&apos;t load.</div>}
    </>
  );

  if (compact)
    return (
      <div className="on-dark fixed inset-0 flex flex-col bg-black pt-[calc(var(--phone-top)+56px)]">
        {/* the screen: 4:3 like the original, full width */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black">
          <div ref={ref} className="jsdos-host absolute inset-0" />
          {status}
        </div>
        {started && (
          <div className="relative flex min-h-0 flex-1 flex-col justify-end px-5 pb-[calc(var(--phone-bottom)+14px)]">
            <div className="mb-auto flex justify-center gap-2 pt-4">
              {(
                [
                  ["Menu", DK.esc],
                  ["Enter", DK.enter],
                  ["Yes", DK.yes],
                ] as const
              ).map(([l, c]) => (
                <button type="button" key={l} data-glass="" {...hold(c)} className={`${pad} h-10 px-4 text-[14px] font-semibold`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-end justify-between">
              <div className="grid grid-cols-3 grid-rows-3 gap-1" role="group" aria-label="Move">
                <button type="button" aria-label="Forward" data-glass="" {...hold(DK.up)} className={`${pad} col-start-2 h-[54px] w-[54px]`}>
                  <Sym icon={ChevronLeft} size={26} className="rotate-90" weight="semibold" />
                </button>
                <button type="button" aria-label="Turn left" data-glass="" {...hold(DK.left)} className={`${pad} col-start-1 row-start-2 h-[54px] w-[54px]`}>
                  <Sym icon={ChevronLeft} size={26} weight="semibold" />
                </button>
                <button type="button" aria-label="Turn right" data-glass="" {...hold(DK.right)} className={`${pad} col-start-3 row-start-2 h-[54px] w-[54px]`}>
                  <Sym icon={ChevronRight} size={26} weight="semibold" />
                </button>
                <button type="button" aria-label="Back" data-glass="" {...hold(DK.down)} className={`${pad} col-start-2 row-start-3 h-[54px] w-[54px]`}>
                  <Sym icon={ChevronLeft} size={26} className="-rotate-90" weight="semibold" />
                </button>
              </div>
              <div className="flex items-end gap-3">
                <button type="button" data-glass="" {...hold(DK.use)} className={`${pad} h-[60px] w-[60px] text-[14px] font-semibold`}>
                  Open
                </button>
                <button type="button" data-glass="" {...hold(DK.fire)} className={`${pad} mb-8 h-[84px] w-[84px] !bg-[#e0412f]/70 text-[16px] font-bold`}>
                  Fire
                </button>
              </div>
            </div>
          </div>
        )}
        {card}
      </div>
    );

  return (
    <div className="on-dark relative flex h-full min-h-[320px] flex-col bg-black">
      <Toolbar title={<span className="text-white/85">DOOM</span>} sub={<span className="text-white/60">Shareware v1.9</span>} />
      <div className="relative min-h-[280px] flex-1">
        <div ref={ref} className="jsdos-host absolute inset-0" />
        {card}
        {status}
      </div>
    </div>
  );
}

// ---------- Art ----------
