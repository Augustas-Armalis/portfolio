"use client";

import { AnimatePresence, MotionGlobalConfig, animate, motion, useMotionValue, useTransform } from "motion/react";
import { ChevronLeft, ChevronRight, PanelLeft, Search, X } from "lucide-react";
import { Sym, type SymIcon } from "./symbols";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { apps, type AppId } from "@/content";
import { useOS } from "@/store";
import { EDGES, EDGE_CURSOR, EDGE_ZONE, clampMove, pointerGesture, resizeRect, type Edge } from "./windowFrame";
import { isSoundEnabled, play as playSfx, setSoundEnabled } from "@/lib/sfx";

// Shared Apple-style primitives. Light first, cool greys, 1px rings,
// radius ladder 6 (chips) / 8 (rows, controls) / 12 (cards, windows) / 16+ (surfaces).

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// Where an app is being drawn: a desktop window (traffic lights top-left)
// or a phone sheet (compact, list -> detail navigation).
export const Chrome = createContext<{ compact: boolean }>({ compact: false });
export const useChrome = () => useContext(Chrome);
// Inside a SplitView's detail the traffic lights sit over the sidebar, so the toolbar needs no inset.
// inside a SplitView: `toggle` shows or hides its sidebar while the window is too narrow to keep it in view
const InSplit = createContext<{ open: boolean; toggle: () => void } | null>(null);
// for an app that draws its own sidebar: wrap it in <SplitFrame>, give the <aside> the split-side class and
// data-shown, and its toolbars get the same sidebar button
export function SplitFrame({ shown, setShown, children, className = "" }: { shown: boolean; setShown: (v: boolean) => void; children: ReactNode; className?: string }) {
  const split = useMemo(() => ({ open: shown, toggle: () => setShown(!shown) }), [shown, setShown]);
  return (
    <div className={`@container/split relative ${className}`}>
      {shown && <button type="button" aria-label="Hide sidebar" tabIndex={-1} onClick={() => setShown(false)} className="absolute inset-0 z-[19] hidden cursor-default @max-[619px]/split:block" />}
      <InSplit.Provider value={split}>{children}</InSplit.Provider>
    </div>
  );
}
// On the phone a pushed screen hands its title and its way back to the app's navigation bar (PhoneOS), so
// Back sits top-left where iOS puts it and the large title names the screen you are on.
export type PhoneDetail = { title: string; back: () => void } | null;
export const PhoneNav = createContext<((d: PhoneDetail) => void) | null>(null);

// Every screen opened inside a phone app (a pushed pane, an album, a photo, a film) registers its way back; a swipe
// from the left edge takes the deepest one, the last to register. Off the phone there is no registry and the hook
// does nothing.
export const PhoneBack = createContext<{ add: (fn: () => void) => () => void } | null>(null);
export function usePhoneBack(active: boolean, back: () => void) {
  const reg = useContext(PhoneBack);
  const fn = useRef(back);
  fn.current = back;
  useEffect(() => {
    if (!reg || !active) return;
    return reg.add(() => fn.current());
  }, [reg, active]);
}

// Runs `fn` with every animation it starts landing at once, then `after` once those have started: a swipe back has
// already carried the screen away, so its own exit must not play again behind the finger.
export function instantly(fn: () => void, after?: () => void) {
  MotionGlobalConfig.instantAnimations = true;
  try {
    flushSync(fn);
  } finally {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        MotionGlobalConfig.instantAnimations = false;
        after?.();
      }),
    );
  }
}

// A swipe in from the left edge, iOS's way back. Spread the handlers on a thin strip along the edge: `move` gets
// the finger's distance as it goes (the screen follows it 1:1), `end` the distance and the release velocity (px/s).
// A move that starts mostly up or down is not a swipe, and a tap on the strip goes to whatever is under it.
export function useEdgeSwipe(h: { start?: () => void; move: (dx: number) => void; end: (dx: number, v: number) => void }) {
  const st = useRef<{ id: number; x0: number; y0: number; on: boolean; dead: boolean; hist: { x: number; t: number }[] } | null>(null);
  const H = useRef(h);
  H.current = h;
  const finish = (e: React.PointerEvent<HTMLElement>) => {
    const s = st.current;
    if (!s || s.id !== e.pointerId) return;
    st.current = null;
    if (s.on) {
      const a = s.hist[0];
      const b = s.hist[s.hist.length - 1];
      const v = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
      H.current.end(e.type === "pointercancel" ? 0 : Math.max(0, e.clientX - s.x0), e.type === "pointercancel" ? 0 : v);
      return;
    }
    if (s.dead || e.type !== "pointerup") return;
    const el = e.currentTarget;
    el.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    el.style.pointerEvents = "";
    ((under?.closest("button,a,[role=button],label") as HTMLElement | null) ?? under)?.click();
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (st.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      st.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, dead: false, hist: [{ x: e.clientX, t: e.timeStamp }] };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // without capture the strip still follows the finger while it stays over the screen
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = st.current;
      if (!s || s.id !== e.pointerId || s.dead) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (!s.on) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx) || dx < 0) {
          s.dead = true;
          return;
        }
        s.on = true;
        H.current.start?.();
      }
      H.current.move(Math.max(0, dx));
      s.hist.push({ x: e.clientX, t: e.timeStamp });
      if (s.hist.length > 5) s.hist.shift();
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "ink" | "live" }) {
  const cls =
    tone === "ink"
      ? "bg-ink text-[var(--bg)]"
      : tone === "live"
        ? "bg-[#E9F6EE] text-[#1F7A45] ring-1 ring-inset ring-[#1F7A45]/15"
        : "bg-field text-ink-2 ring-1 ring-inset ring-black/[0.06]";
  return <span className={`inline-flex h-5 items-center rounded-[8px] px-1.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

// Older call sites: one mapping onto Btn so every button in the OS is the same component.
export function Button({
  children,
  onClick,
  href,
  variant = "secondary",
  size = "md",
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
}) {
  return (
    <Btn variant={variant === "primary" ? "prominent" : variant === "ghost" ? "plain" : "bordered"} size={size} icon={icon} href={href} onClick={onClick ? () => onClick() : undefined}>
      {children}
    </Btn>
  );
}

// ---------- motion: one language for the whole OS ----------
// Every move in the OS takes its timing from here; nothing sets a spring or a duration of its own.
// Springs are Apple's two numbers (duration = response, bounce = 1 - damping). The default has no bounce:
// overshoot belongs to things that were thrown (a drag let go) and to glass, which is a drop, never to a menu
// or a window that a click opened.
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const M = {
  // menus, popovers, tooltips, a switch: small, seen often, over in a quarter of a second
  pop: { type: "spring", bounce: 0, duration: 0.24 },
  // windows, panels, sidebars, pushes: anything that travels on screen
  ui: { type: "spring", bounce: 0, duration: 0.38 },
  // sheets, phone apps, full-screen surfaces (the one place half a second is right)
  sheet: { type: "spring", bounce: 0, duration: 0.5 },
  // a glass surface changing shape (Control Center, the Dynamic Island, a selection drop)
  glass: { type: "spring", bounce: 0.2, duration: 0.45 },
  // let go after a drag: seeded with the release velocity, the only bounce a finger earns
  fling: { type: "spring", bounce: 0.15, duration: 0.5 },
  // a move between two places on screen (minimise into the Dock)
  move: { duration: 0.36, ease: EASE_IN_OUT },
  // every exit: shorter than its entrance, all at once
  out: { duration: 0.14, ease: EASE_OUT },
  // a cross-fade
  fade: { duration: 0.2, ease: EASE_OUT },
  // rare: the system arriving (menu bar, Dock, the lock face)
  arrive: { duration: 0.55, ease: EASE_OUT },
} as const;
// the glass family by its older names. LEAD/TRAIL: the two edges of a selection drop; the edge in front leaves
// first and the one behind catches up, so the drop stretches as it slides.
export const SPRING_GLASS = M.glass;
export const SPRING_LEAD = { type: "spring", bounce: 0.14, duration: 0.34 } as const;
export const SPRING_TRAIL = { type: "spring", bounce: 0.24, duration: 0.5 } as const;

// While a glass surface is in motion it drops the refraction filter (plain frost is cheap to composite, an SVG
// displacement backdrop is not) and takes it back when it lands. Spread the result on a motion element.
export function useMorph<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  return {
    ref,
    onAnimationStart: () => ref.current?.setAttribute("data-morphing", ""),
    onAnimationComplete: () => ref.current?.removeAttribute("data-morphing"),
  };
}

export const reducedMotion = () =>
  typeof window !== "undefined" && (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-fx"));

// The selection drop of a segmented control or tab bar. It sits behind the options (which carry data-seg) and
// moves by its two edges, each on its own spring. Only this one small leaf changes size; nothing reflows.
export function GlassThumb({ index, className = "" }: { index: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const l = useMotionValue(0);
  const r = useMotionValue(0);
  const placed = useRef(false);
  // written straight to the element: no render, and both edges land in the same frame
  useLayoutEffect(() => {
    const draw = () => {
      const el = ref.current;
      if (!el) return;
      el.style.transform = `translateX(${l.get()}px)`;
      el.style.width = `${Math.max(0, r.get() - l.get())}px`;
    };
    const a = l.on("change", draw);
    const b = r.on("change", draw);
    return () => {
      a();
      b();
    };
  }, [l, r]);
  const place = (jump: boolean) => {
    const el = ref.current?.parentElement?.querySelectorAll<HTMLElement>("[data-seg]")[idx.current];
    if (!el) return;
    const nl = el.offsetLeft;
    const nr = nl + el.offsetWidth;
    if (jump || reducedMotion()) {
      l.stop();
      r.stop();
      l.jump(nl);
      r.jump(nr);
      return;
    }
    const right = nl > l.get();
    animate(l, nl, right ? SPRING_TRAIL : SPRING_LEAD);
    animate(r, nr, right ? SPRING_LEAD : SPRING_TRAIL);
  };
  const idx = useRef(index);
  useLayoutEffect(() => {
    idx.current = index;
    place(!placed.current);
    placed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  // the control changed size (a window resize, a font landing): the drop follows without animating
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    let w = host.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (host.offsetWidth === w) return;
      w = host.offsetWidth;
      place(true);
    });
    ro.observe(host);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span ref={ref} aria-hidden className={`pointer-events-none absolute left-0 ${className}`} />;
}

export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; id: string }) {
  const { compact } = useChrome();
  return (
    <div role="radiogroup" data-seg-id={id} className={`seg relative flex items-center bg-[var(--fill-2)] p-[2px] ${compact ? "h-9 rounded-[12px]" : "h-7 rounded-[10px]"}`}>
      <GlassThumb index={options.findIndex((o) => o.value === value)} className={`seg-thumb inset-y-[2px] ${compact ? "rounded-[10px]" : "rounded-[8px]"}`} />
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-seg=""
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`relative font-medium transition-colors duration-200 ${compact ? "h-8 min-w-[72px] px-4 text-[14px]" : "h-6 px-2.5 text-[12px]"} ${value === o.value ? "text-ink" : "text-ink-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// iOS switch. Round because it's an indicator.
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-[#34C759]" : "bg-[var(--fill)]"}`}
    >
      <motion.span
        animate={{ x: on ? 16 : 0 }}
        transition={M.pop}
        className="absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)]"
      />
    </button>
  );
}

// Visual placeholder: a soft cool-grey field with grain, not a striped box.
export function Visual({ label, className = "", dark = false, src, alt = "" }: { label?: string; className?: string; dark?: boolean; src?: string; alt?: string }) {
  return (
    <div
      className={`visual sq-card relative flex items-end overflow-hidden rounded-[16px] ${dark ? "visual-dark" : ""} ${className}`}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      {src && <span className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.08)]" />}
      {label && !src && (
        <span className={`m-3 text-[11px] font-medium ${dark ? "text-white/55" : "text-ink-3"}`}>{label}</span>
      )}
    </div>
  );
}

// macOS-style toolbar. In a window the traffic lights sit at its left.
export function Toolbar({ title, sub, children, inset }: { title?: ReactNode; sub?: ReactNode; children?: ReactNode; inset?: boolean }) {
  const { compact } = useChrome();
  const inSplit = useContext(InSplit);
  const pad = inset ?? !inSplit;
  if (compact) {
    if (!children) return null;
    return <div className="flex items-center justify-end gap-2 px-4 pb-3">{children}</div>;
  }
  return (
    <div
      data-drag
      className={`toolbar flex h-[52px] min-w-0 shrink-0 items-center gap-2 [overflow-x:clip] border-b border-black/[0.06] pr-3 ${pad ? "pl-[84px]" : "pl-5 @max-[619px]/split:pl-[84px]"}`}
    >
      {inSplit && (
        // only while the sidebar is tucked away (the window is narrow): brings it back over the content
        <Btn variant="plain" size="sm" iconOnly label={inSplit.open ? "Hide sidebar" : "Show sidebar"} icon={<Sym icon={PanelLeft} size={16} weight="medium" />} onClick={inSplit.toggle} className="split-toggle -ml-1 !hidden @max-[619px]/split:!inline-flex" />
      )}
      <div className="min-w-0 flex-1">
        {title && <div className="toolbar-title truncate text-ink">{title}</div>}
        {sub && <div className="truncate text-[11px] leading-[14px] text-ink-2">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// macOS toolbar search field.
export function SearchField({ value, onChange, placeholder = "Search", id }: { value: string; onChange: (v: string) => void; placeholder?: string; id: string }) {
  const { compact } = useChrome();
  return (
    <label
      htmlFor={id}
      className={`search flex items-center gap-1.5 text-ink-3 ${
        compact ? "h-9 w-full shrink-0 rounded-[12px] bg-[#767680]/[0.12] px-2" : "h-8 w-[190px] min-w-[88px] shrink rounded-full bg-black/[0.05] px-2.5 focus-within:ring-[3px] focus-within:ring-[var(--accent)]/30"
      }`}
    >
      <Sym icon={Search} size={compact ? 17 : 14} weight="medium" className="shrink-0" />
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3 ${compact ? "text-[17px] tracking-[-0.02em]" : "text-[13px]"}`}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-3 text-white">
          <Sym icon={X} size={10} weight="bold" />
        </button>
      )}
    </label>
  );
}

// Quick Look. On the desktop it's a real window: drag it by the glass title bar, resize from the corner, close with
// the red light or Space/Esc, fill the screen with the green one, step through with the arrows. One at a time:
// opening another item reuses it, like macOS. On the phone it's a full-screen viewer.
export type LookItem = { title: string; src?: string; node?: ReactNode };
export const FILE_MIME = "application/x-aos-file";
// an image that can be dragged out of an app onto the desktop, where it lands as a file
// The dragged file keeps the extension of the image it is (a title alone would land on the desktop without one).
export function dragFile(title: string, src: string) {
  const ext = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(src)?.[1]?.toLowerCase();
  const name = ext && !/\.[a-z0-9]{2,5}$/i.test(title) ? `${title}.${ext}` : title;
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(FILE_MIME, JSON.stringify({ name, src }));
      e.dataTransfer.effectAllowed = "copy";
    },
  };
}
export function QuickLook({ items, index, onIndex, onClose }: { items: LookItem[]; index: number | null; onIndex?: (i: number) => void; onClose: () => void }) {
  const { compact } = useChrome();
  usePhoneBack(compact && index !== null, onClose);
  const it = index === null ? null : items[index];
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onClose();
      }
      if (onIndex && e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (onIndex && e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);
  const many = items.length > 1 && !!onIndex;
  const [zoomed, setZoomed] = useState(false);
  // the phone viewer is black to the top edge: the status bar turns white over it
  const open = index !== null;
  useEffect(() => {
    if (!compact || !open) return;
    useOS.getState().setHeroDark(true);
    return () => useOS.getState().setHeroDark(false);
  }, [compact, open]);
  if (compact)
    return (
      <AnimatePresence>
        {it && index !== null && (
          <motion.div
            key="ql"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: M.out }}
            transition={M.fade}
            className="fixed inset-0 z-[2400] flex flex-col bg-black"
          >
            <Btn variant="glass-dark" capsule iconOnly size="md" label="Close" onClick={onClose} icon={<Sym icon={X} size={17} weight="semibold" />} className="absolute right-4 top-[calc(var(--phone-top)+4px)] z-10 !h-11 !w-11" />
            {/* a document (the résumé) is longer than the screen: it scrolls from its top, under the Close button,
                instead of being centred with its head cut off */}
            {it.node && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#E9EAED] pt-[calc(var(--phone-top)+52px)]">{it.node}</div>}
            <motion.div
              hidden={!!it.node}
              drag={many && !zoomed ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.5}
              onDragEnd={(_, info) => {
                if (!onIndex) return;
                if (info.offset.x < -80) onIndex((index + 1) % items.length);
                if (info.offset.x > 80) onIndex((index - 1 + items.length) % items.length);
              }}
              className={it.node ? "hidden" : "flex min-h-0 flex-1 touch-pan-y items-center justify-center"}
            >
              {!it.node && it.src && <ZoomImage key={it.src} src={it.src} alt={it.title} onZoom={setZoomed} />}
            </motion.div>
            <div className="pb-[calc(var(--phone-bottom)+10px)] pt-3 text-center text-[15px] font-semibold text-white">
              {it.title}
              {many && <span className="ml-2 font-normal text-white/50">{`${index + 1} of ${items.length}`}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  if (typeof document === "undefined") return null;
  // it lives in the desktop's window layer, so it takes part in the same focus order as every window
  const host = document.getElementById("os-window-layer") ?? document.body;
  return createPortal(
    <AnimatePresence>{it && index !== null && <LookWindow key="qlw" it={it} index={index} count={items.length} onIndex={many ? onIndex : undefined} onClose={onClose} />}</AnimatePresence>,
    host,
  );
}

// Pinch with two fingers (scale follows the fingers 1:1, around their midpoint), drag to pan while zoomed,
// double-tap to toggle 2x. Letting go under 1x springs back. Pointer events only, motion values, no re-renders.
function ZoomImage({ src, alt, onZoom }: { src: string; alt: string; onZoom?: (zoomed: boolean) => void }) {
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ d: number; s: number; mx: number; my: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const settle = () => {
    const s = scale.get();
    if (s <= 1.02) {
      animate(scale, 1, SPRING_UI);
      animate(x, 0, SPRING_UI);
      animate(y, 0, SPRING_UI);
      onZoom?.(false);
    } else if (s > 4) animate(scale, 4, SPRING_UI);
  };
  const two = () => {
    const [a, b] = [...pts.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <motion.img
      src={src}
      alt={alt}
      draggable={false}
      style={{ scale, x, y, touchAction: "none" }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 2) {
          const t = two();
          start.current = { d: t.d, s: scale.get(), mx: t.mx, my: t.my, x: x.get(), y: y.get() };
          onZoom?.(true);
        } else if (pts.current.size === 1) {
          const now = e.timeStamp;
          if (now - lastTap.current < 280) {
            const z = scale.get() > 1.05 ? 1 : 2;
            animate(scale, z, SPRING_UI);
            if (z === 1) {
              animate(x, 0, SPRING_UI);
              animate(y, 0, SPRING_UI);
            }
            onZoom?.(z > 1);
          }
          lastTap.current = now;
          start.current = { d: 0, s: scale.get(), mx: e.clientX, my: e.clientY, x: x.get(), y: y.get() };
        }
      }}
      onPointerMove={(e) => {
        if (!pts.current.has(e.pointerId) || !start.current) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const st = start.current;
        if (pts.current.size >= 2) {
          const t = two();
          scale.set(Math.max(0.6, Math.min(5, st.s * (t.d / Math.max(st.d, 1)))));
          x.set(st.x + (t.mx - st.mx));
          y.set(st.y + (t.my - st.my));
        } else if (scale.get() > 1.02) {
          x.set(st.x + (e.clientX - st.mx));
          y.set(st.y + (e.clientY - st.my));
        }
      }}
      onPointerUp={(e) => {
        pts.current.delete(e.pointerId);
        if (pts.current.size === 1) {
          const [p] = [...pts.current.values()];
          start.current = { d: 0, s: scale.get(), mx: p.x, my: p.y, x: x.get(), y: y.get() };
        }
        if (pts.current.size === 0) settle();
      }}
      onPointerCancel={(e) => {
        pts.current.delete(e.pointerId);
        if (pts.current.size === 0) settle();
      }}
      className="max-h-full w-full select-none object-contain"
    />
  );
}

const SPRING_UI = M.ui;

function LookWindow({ it, index, count, onIndex, onClose }: { it: LookItem; index: number; count: number; onIndex?: (i: number) => void; onClose: () => void }) {
  const bounds = useRef<HTMLDivElement>(null);
  // the area above the dock line, under the menu bar
  const W = typeof window !== "undefined" ? window.innerWidth : 1280;
  const H = typeof window !== "undefined" ? window.innerHeight - 24 - 92 : 700;
  const w = useMotionValue(Math.min(760, W - 120));
  const h = useMotionValue(Math.min(it.node ? 620 : 520, H - 24));
  const x = useMotionValue((W - w.get()) / 2);
  const y = useMotionValue(Math.max(8, (H - h.get()) / 2));
  // focus order: opening or clicking it brings it to the front, above every window; a window clicked later goes over it
  const [z, setZ] = useState(() => useOS.getState().topZ + 1);
  const windows = useOS((s) => s.windows);
  const focus = () => {
    const top = useOS.getState().topZ;
    if (z >= top) return;
    const t = top + 1;
    useOS.setState({ topZ: t });
    setZ(t);
  };
  // claim the front on open (in an effect, so a double render can't claim it twice)
  useEffect(() => {
    if (z > useOS.getState().topZ) useOS.setState({ topZ: z });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // in front of every open window = focused (its lights are lit, theirs go grey)
  const focused = !windows.some((w) => !w.min && w.z >= z);
  const [full, setFull] = useState(false);
  const saved = useRef<number[] | null>(null);
  const toggleFull = () => {
    if (!full) {
      saved.current = [x.get(), y.get(), w.get(), h.get()];
      animate(x, 0, SPRING_UI);
      animate(y, 0, SPRING_UI);
      animate(w, window.innerWidth, SPRING_UI);
      animate(h, window.innerHeight - 24 - 92, SPRING_UI);
    } else if (saved.current) {
      const [a, b, c, d] = saved.current;
      animate(x, a, SPRING_UI);
      animate(y, b, SPRING_UI);
      animate(w, c, SPRING_UI);
      animate(h, d, SPRING_UI);
    }
    setFull(!full);
  };
  // the same frame rules as an app window (windowFrame.ts): under the menu bar, 12px off the sides, above the dock
  const frameBounds = () => {
    const el = bounds.current;
    const W = el?.clientWidth ?? window.innerWidth;
    const H = el?.clientHeight ?? window.innerHeight - 24 - 92;
    return { left: 12, top: 8, right: W - 12, bottom: H };
  };
  const now = () => ({ left: x.get(), top: y.get(), w: w.get(), h: h.get() });
  // move by the title bar: the grab point stays under the pointer, one write per frame, never out of bounds
  const move = (e: React.PointerEvent) => {
    if (full || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const b = frameBounds();
    const r0 = now();
    const at = (dx: number, dy: number) => {
      const r = clampMove({ ...r0, left: r0.left + dx, top: r0.top + dy }, b);
      x.set(r.left);
      y.set(r.top);
    };
    pointerGesture(e, "default", at, at, 3);
  };
  // resize from every edge and corner, within the minimum and the space above the dock
  const resize = (edge: Edge) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    focus();
    const b = frameBounds();
    const r0 = now();
    const at = (dx: number, dy: number) => {
      const r = resizeRect(r0, edge, dx, dy, { w: 320, h: 240 }, { w: b.right - b.left, h: b.bottom - b.top }, b);
      x.set(r.left);
      y.set(r.top);
      w.set(r.w);
      h.set(r.h);
    };
    pointerGesture(e, EDGE_CURSOR[edge], at, at);
  };
  const light = (c: string, label: string, glyph: string, on?: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={on}
      disabled={!on}
      className="flex h-3 w-3 items-center justify-center rounded-full ring-[0.5px] ring-inset ring-black/[0.12]"
      style={{ background: on && focused ? c : "#DCDCDF" }}
    >
      <svg viewBox="0 0 12 12" className="h-[8px] w-[8px] opacity-0 hov:group-hover/ql:opacity-100" aria-hidden="true">
        <path d={glyph} stroke="rgb(0 0 0 / 0.5)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      </svg>
    </button>
  );
  return (
    <div ref={bounds} className="pointer-events-none absolute inset-x-0 bottom-[92px] top-0" style={{ zIndex: z }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96, transition: M.out }}
        transition={SPRING_UI}
        onPointerDown={focus}
        style={{ x, y, width: w, height: h }}
        className="pointer-events-auto absolute left-0 top-0"
        data-look-window=""
      >
      <div className={`win flex h-full w-full flex-col overflow-hidden ${focused ? "is-focused" : ""}`} data-sq="">
        {/* one frame: the image runs edge to edge under a glass title bar */}
        <div className="absolute inset-0 bg-[var(--surface-2)]">
          {it.node ? (
            <div className="h-full overflow-auto pt-[38px]">{it.node}</div>
          ) : (
            it.src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.src} alt={it.title} {...dragFile(it.title, it.src)} className="h-full w-full object-contain pt-[38px]" />
            )
          )}
        </div>
        <div
          onPointerDown={move}
          onDoubleClick={(e) => !(e.target as HTMLElement).closest("button") && toggleFull()}
          data-glass=""
          className="glass glass-bar group/ql relative z-10 flex h-[38px] shrink-0 items-center justify-center px-20"
        >
          <span className="absolute left-3 flex gap-[8px]">
            {light("#FF5F57", "Close", "M3 3l6 6M9 3l-6 6", onClose)}
            {light("#FEBC2E", "Minimise", "M2.5 6h7")}
            {light("#28C840", full ? "Exit full screen" : "Full screen", "M3.5 8.5l5-5M3.5 4v4.5H8", toggleFull)}
          </span>
          <span className="m-headline truncate text-ink">{it.title}</span>
          {onIndex && (
            <span className="absolute right-2 flex items-center gap-0.5">
              <span className="m-sub mr-1 tabular-nums text-ink-3">{`${index + 1} of ${count}`}</span>
              <Btn variant="plain" size="sm" iconOnly label="Previous" onClick={() => onIndex((index - 1 + count) % count)} icon={<Sym icon={ChevronLeft} size={16} weight="semibold" />} />
              <Btn variant="plain" size="sm" iconOnly label="Next" onClick={() => onIndex((index + 1) % count)} icon={<Sym icon={ChevronRight} size={16} weight="semibold" />} />
            </span>
          )}
        </div>
      </div>
        {!full && EDGES.map((ed) => <div key={ed} data-edge={ed} onPointerDown={resize(ed)} className={`absolute z-20 touch-none ${EDGE_ZONE[ed]}`} style={{ cursor: EDGE_CURSOR[ed] }} />)}
      </motion.div>
    </div>
  );
}

export type SideItem = { id: string; label: string; icon?: ReactNode; meta?: ReactNode; sub?: ReactNode };

// Sidebar + detail. On a phone it becomes list -> detail with a back button.
export function SplitView({
  sections,
  selected,
  onSelect,
  detail,
  width = 200,
  header,
  footer,
  startPushed,
}: {
  sections: { title?: string; items: SideItem[] }[];
  selected: string;
  onSelect: (id: string) => void;
  detail: ReactNode;
  width?: number;
  // sits above the source list (System Settings' account row); on the phone it leads the list
  header?: ReactNode;
  // the phone only: rows after the list (Settings' Shut Down)
  footer?: ReactNode;
  // on the phone, open on the selected item's detail (a folder opens on its contents, with Back to the list)
  startPushed?: boolean;
}) {
  const { compact } = useChrome();
  const [pushed, setPushed] = useState(!!startPushed);
  const [folded, setFolded] = useState<string[]>([]);
  // the Mac, in a narrow window: whether the tucked-away sidebar is showing
  const [shown, setShown] = useState(false);
  const split = useMemo(() => ({ open: shown, toggle: () => setShown((v) => !v) }), [shown]);
  const nav = useContext(PhoneNav);
  const pushedTitle = sections.flatMap((x) => x.items).find((i) => i.id === selected)?.label ?? "";
  useEffect(() => {
    if (!compact || !nav) return;
    nav(pushed ? { title: pushedTitle, back: () => setPushed(false) } : null);
    return () => nav(null);
  }, [compact, nav, pushed, pushedTitle]);
  usePhoneBack(compact && pushed, () => setPushed(false));
  if (compact) {
    return (
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {pushed ? (
            <motion.div
              key="detail"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={M.ui}
              className="min-h-[60vh]"
            >
              {!nav && (
                <button type="button" onClick={() => setPushed(false)} className="press flex h-11 items-center gap-0.5 pl-2 pr-3 text-[17px] tracking-[-0.02em] text-[var(--accent-text)]">
                  <Sym icon={ChevronLeft} size={26} className="-mr-1" weight="semibold" /> Back
                </button>
              )}
              {detail}
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ x: "-25%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-25%", opacity: 0.6 }}
              transition={M.ui}
              className="px-4 pb-8"
            >
              {header}
              {sections.map((s, i) => (
                <div key={i} className="mt-4">
                  {s.title && <div className="mb-[7px] px-4 text-[13px] uppercase tracking-[-0.005em] text-[#6D6D72]">{s.title}</div>}
                  <div className="sq-list overflow-hidden rounded-[12px] bg-white">
                    {s.items.map((it, j) => (
                      <button
                        type="button"
                        key={it.id}
                        onClick={() => {
                          onSelect(it.id);
                          setPushed(true);
                        }}
                        className="press-row flex min-h-[44px] w-full items-center gap-3 pl-4 text-left"
                      >
                        {it.icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center text-ink-2">{it.icon}</span>}
                        <span className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 pr-4 ${it.sub ? "py-2" : ""} ${j ? "border-t-[0.5px] border-[#C6C6C8]" : ""}`}>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[17px] tracking-[-0.02em] text-ink ${it.sub ? "font-semibold" : ""}`}>{it.label}</span>
                            {it.sub && <span className="t-sub block truncate text-ink-2">{it.sub}</span>}
                          </span>
                          {it.meta}
                          <Sym icon={ChevronRight} size={20} className="-mr-1.5 text-[#C4C4C7]" weight="semibold" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {footer}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div className="@container/split relative flex h-full min-h-0">
      {shown && <button type="button" aria-label="Hide sidebar" tabIndex={-1} onClick={() => setShown(false)} className="absolute inset-0 z-[19] hidden cursor-default @max-[619px]/split:block" />}
      <aside
        data-drag
        data-shown={shown}
        onKeyDown={(e) => {
          // arrow keys walk the sidebar like a real source list
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const ids = sections.flatMap((s) => s.items.map((i) => i.id));
          const i = ids.indexOf(selected);
          const next = ids[Math.min(ids.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))];
          if (next && next !== selected) {
            e.preventDefault();
            onSelect(next);
            (e.currentTarget.querySelector(`[data-id="${next}"]`) as HTMLElement | null)?.focus();
          }
        }}
        className="split-side flex shrink-0 flex-col gap-3 overflow-auto border-r border-black/[0.06] bg-[#F4F4F6] px-2.5 pb-3 pt-[52px]"
        style={{ width }}
      >
        {header}
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && (
              // a section folds away from its header, with the chevron macOS shows on hover
              <button
                type="button"
                aria-expanded={!folded.includes(s.title)}
                onClick={() => setFolded((f) => (f.includes(s.title!) ? f.filter((x) => x !== s.title) : [...f, s.title!]))}
                className="group/sec flex h-[22px] w-full items-center justify-between rounded-[6px] px-2 text-left text-[11px] font-semibold text-ink-3"
              >
                {s.title}
                <Sym
                  icon={ChevronRight}
                  size={11}
                  weight="bold"
                  className={`opacity-0 transition-[transform,opacity] duration-200 hov:group-hover/sec:opacity-100 ${folded.includes(s.title) ? "" : "rotate-90"}`}
                />
              </button>
            )}
            <div className={`fold ${s.title && folded.includes(s.title) ? "is-closed" : ""}`}>
            <div className="flex flex-col">
              {s.items.map((it) => {
                const on = it.id === selected;
                return (
                  <button
                    type="button"
                    key={it.id}
                    data-id={it.id}
                    onClick={() => {
                      onSelect(it.id);
                      setShown(false);
                    }}
                    className={`flex shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] tracking-[-0.003em] ${it.sub ? "h-[46px] rounded-[10px]" : "h-[28px]"} ${
                      on ? "bg-black/[0.08] text-ink" : "text-ink hov:hover:bg-black/[0.035]"
                    }`}
                  >
                    {it.icon && <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center ${on ? "text-ink" : "text-ink-2"}`}>{it.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${it.sub ? "font-semibold" : ""}`}>{it.label}</span>
                      {it.sub && <span className="m-sub block truncate text-ink-2">{it.sub}</span>}
                    </span>
                    {it.meta}
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        ))}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto bg-white">
        <InSplit.Provider value={split}>{detail}</InSplit.Provider>
      </div>
    </div>
  );
}

// Settings-style grouped rows.
export function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const { compact } = useChrome();
  return (
    <section>
      {title && <h3 className={compact ? "t-foot mb-[7px] px-4 uppercase text-[var(--label-2)]" : "mb-1.5 px-1 text-[13px] font-semibold text-ink"}>{title}</h3>}
      <div className="sq divide-y divide-[var(--separator)] overflow-hidden rounded-[12px] bg-[var(--bg-elevated)] shadow-[var(--shadow-1)]">{children}</div>
      {footer && <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-ink-3">{footer}</p>}
    </section>
  );
}

export function Row({ label, children, sub }: { label: ReactNode; children?: ReactNode; sub?: ReactNode }) {
  const { compact } = useChrome();
  return (
    <div className={`flex items-center gap-3 ${compact ? "min-h-[48px] px-4 py-2" : "min-h-[40px] px-2.5 py-1.5"}`}>
      <div className="min-w-0 flex-1">
        <div className={compact ? "t-body text-ink" : "text-[13px] text-ink"}>{label}</div>
        {sub && <div className={compact ? "t-foot text-ink-3" : "text-[11px] text-ink-3"}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// App icon: a squircle tile with a Lucide glyph. Light by default, one dark tile per profile.
export function AppTile({ id, size = 52, icon, dark }: { id: AppId; size?: number; icon: ReactNode; dark?: boolean }) {
  return (
    <div
      aria-hidden
      className={`app-tile flex shrink-0 items-center justify-center ${dark ? "app-tile-dark text-white" : "text-ink"}`}
      style={{ width: size, height: size, borderRadius: size * 0.225 }}
      title={apps[id].title}
    >
      {icon}
    </div>
  );
}

// ---------- Glass: one material for every translucent surface ----------
// Ported from larpo.studio (LiquidGlass.tsx). Not just a blur: in Chromium the backdrop is bent through the rim.
//   1. a displacement map is drawn on a canvas for the element's size and corner radius: flat in the middle, and
//      across a bezel along the edge it pushes each sample inward along the edge's normal, steepest at the rim
//   2. an SVG filter runs the backdrop through that map three times at slightly different strengths and keeps one
//      colour channel from each, so the rim splits into a faint rainbow like thick glass
//   3. backdrop-filter points at that filter (--lg). Only Chromium can run an SVG filter as a backdrop; Safari and
//      Firefox get html.lg-css and the CSS fallback in globals.css (more frost, a sheen, a hairline)
// Use <Glass tone="pop"> or put className="glass glass-<tone>" and data-glass on any element; useGlassScope()
// (called once by Desktop, PhoneOS and Login) finds them all as they mount.

const POW = 2;
const maps = new Map<string, string>();
function displacementMap(w: number, h: number, r: number, bezel: number) {
  const key = `${w}x${h}r${r.toFixed(1)}b${bezel.toFixed(1)}`;
  const had = maps.get(key);
  if (had !== undefined) return had;
  const sdf = (x: number, y: number) => {
    const qx = Math.abs(x - w / 2) - (w / 2 - r);
    const qy = Math.abs(y - h / 2) - (h / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  if (!g) return "";
  const img = g.createImageData(w, h);
  new Uint32Array(img.data.buffer).fill(0xff808080);
  const band = Math.ceil(bezel) + 1;
  const px = (x: number, y: number) => {
    const d = -sdf(x + 0.5, y + 0.5);
    if (d <= 0 || d >= bezel) return;
    const nx = sdf(x + 1.5, y + 0.5) - sdf(x - 0.5, y + 0.5);
    const ny = sdf(x + 0.5, y + 1.5) - sdf(x + 0.5, y - 0.5);
    const len = Math.hypot(nx, ny) || 1;
    const bend = Math.pow(1 - d / bezel, POW);
    const i = (y * w + x) * 4;
    img.data[i] = 128 + (-nx / len) * bend * 127;
    img.data[i + 1] = 128 + (-ny / len) * bend * 127;
  };
  for (let y = 0; y < h; y++) {
    if (y < band || y >= h - band || w <= band * 2) {
      for (let x = 0; x < w; x++) px(x, y);
      continue;
    }
    for (let x = 0; x < band; x++) px(x, y);
    for (let x = w - band; x < w; x++) px(x, y);
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL();
  if (maps.size > 120) maps.clear();
  maps.set(key, url);
  return url;
}

// Safari parses an SVG url in backdrop-filter and then draws nothing, so the bending is Chromium only.
export const canRefract = () =>
  typeof navigator !== "undefined" &&
  /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) &&
  typeof CSS !== "undefined" &&
  CSS.supports("backdrop-filter", "url(#a)") &&
  !window.matchMedia("(prefers-reduced-transparency: reduce)").matches;

const keep = (k: number) => {
  const m = Array(20).fill(0);
  m[k * 5 + k] = 1;
  m[18] = 1;
  return m.join(" ");
};

const NS = "http://www.w3.org/2000/svg";
let defs: SVGSVGElement | null = null;
let seq = 0;
function filterFor(id: string, w: number, h: number, map: string, max: number) {
  const set = (el: Element, a: Record<string, string | number>) => {
    for (const k in a) el.setAttribute(k, String(a[k]));
    return el;
  };
  const f = document.createElementNS(NS, "filter");
  set(f, { id, x: 0, y: 0, width: w, height: h, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
  f.appendChild(set(document.createElementNS(NS, "feImage"), { href: map, x: 0, y: 0, width: w, height: h, result: "map", preserveAspectRatio: "none" }));
  [1, 1.025, 1.05].forEach((s, k) => {
    f.appendChild(set(document.createElementNS(NS, "feDisplacementMap"), { in: "SourceGraphic", in2: "map", scale: max * 2 * s, xChannelSelector: "R", yChannelSelector: "G", result: `d${k}` }));
    f.appendChild(set(document.createElementNS(NS, "feColorMatrix"), { in: `d${k}`, type: "matrix", values: keep(k), result: `c${k}` }));
  });
  f.appendChild(set(document.createElementNS(NS, "feComposite"), { in: "c0", in2: "c1", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result: "rg" }));
  f.appendChild(set(document.createElementNS(NS, "feComposite"), { in: "rg", in2: "c2", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 }));
  return f;
}

// Elements bigger than this stay frosted: their glass would be mostly flat middle and cost a large filter.
const MAX_AREA = 420_000;
// and no more than this many refracting surfaces at once; the rest stay plain frosted glass
const MAX_GLASS = 36;
const idle = (fn: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 300 });
  else window.setTimeout(fn, 60);
};

function attachGlass(el: HTMLElement) {
  if (!defs) {
    defs = document.createElementNS(NS, "svg");
    defs.setAttribute("width", "0");
    defs.setAttribute("height", "0");
    defs.setAttribute("aria-hidden", "true");
    defs.style.position = "absolute";
    defs.style.pointerEvents = "none";
    document.body.appendChild(defs);
  }
  const id = `lg-${++seq}`;
  let f: SVGFilterElement | null = null;
  let size = "";
  const off = () => {
    f?.remove();
    f = null;
    el.removeAttribute("data-lg");
    el.style.removeProperty("--lg");
  };
  const build = () => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h || `${w}x${h}` === size) return;
    size = `${w}x${h}`;
    if (w * h > MAX_AREA) return off();
    // a bevel about 40% of the height, up to 24px; the push stays under the fold point so the rim magnifies, never smears
    const bezel = Math.max(6, Math.min(24, h * 0.4, w / 2));
    const max = bezel * 0.4;
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
    const next = filterFor(id, w, h, displacementMap(w, h, r, bezel), max);
    if (f) f.replaceWith(next);
    else defs!.appendChild(next);
    f = next as unknown as SVGFilterElement;
    el.style.setProperty("--lg", `url(#${id})`);
    el.setAttribute("data-lg", "");
    light();
  };
  // the specular edge follows the element's place on screen: the light sits above the middle of the display, so
  // glass on the left catches it on its right-hand rim and glass at the bottom along its top
  const light = () => {
    const b = el.getBoundingClientRect();
    const lx = ((b.left + b.width / 2) / Math.max(1, window.innerWidth) - 0.5) * -2;
    el.style.setProperty("--lx", `${(lx * 1.1).toFixed(2)}px`);
    el.style.setProperty("--ly", `${(0.6 + ((b.top + b.height / 2) / Math.max(1, window.innerHeight)) * 0.7).toFixed(2)}px`);
  };
  // Drawn in the frame that mounts it (attachGlass runs before that frame paints), so a surface is never seen
  // first as plain frost and a moment later bent at the rim. A map is a few milliseconds once and is kept by
  // size, so the second menu of a size costs nothing. Only later size changes wait for an idle moment.
  let gone = false;
  let queued = false;
  const soon = () => {
    if (queued || gone) return;
    queued = true;
    idle(() => {
      queued = false;
      if (!gone) build();
    });
  };
  build();
  const ro = new ResizeObserver(soon);
  ro.observe(el);
  return () => {
    gone = true;
    ro.disconnect();
    off();
  };
}

let scopes = 0;
let stopScope: (() => void) | null = null;
function installGlass() {
  const refract = canRefract();
  document.documentElement.classList.toggle("lg-css", !refract);
  if (!refract) return () => document.documentElement.classList.remove("lg-css");
  const tracked = new Map<Element, () => void>();
  let raf = 0;
  const scan = () => {
    raf = 0;
    // Only clear glass bends its backdrop: the Dock, widgets, the lock screen's controls, the round buttons over
    // content. Dense glass (menus, panels, the menu bar: 66 to 82% fill) shows no bend through its tint, measured
    // side by side, and neither do toolbar capsules over a white window, so they keep the frost and skip the
    // filter. That takes an SVG backdrop pass off every menu and off every window that moves.
    document.querySelectorAll<HTMLElement>("[data-glass]").forEach((el) => {
      if (tracked.has(el) || tracked.size >= MAX_GLASS) return;
      if (el.classList.contains("glass-pop") || el.classList.contains("glass-bar") || el.classList.contains("ios-bar") || el.classList.contains("ios-bar-dark")) return;
      tracked.set(el, attachGlass(el));
    });
    tracked.forEach((stop, el) => {
      if (!el.isConnected) {
        stop();
        tracked.delete(el);
      }
    });
  };
  const mo = new MutationObserver(() => {
    if (!raf) raf = requestAnimationFrame(scan);
  });
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => {
    mo.disconnect();
    cancelAnimationFrame(raf);
    tracked.forEach((stop) => stop());
    tracked.clear();
  };
}

// Light, Dark or Auto: puts .dark on <html> so every token switches. Auto follows the system setting.
function useAppearance() {
  const appearance = useOS((s) => s.appearance);
  const tinted = useOS((s) => s.tintedIcons);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aos.appearance");
      if (saved === "light" || saved === "dark" || saved === "auto") useOS.setState({ appearance: saved });
      if (localStorage.getItem("aos.reduce") === "1") useOS.setState({ reduceEffects: true });
    } catch {}
  }, []);
  const reduce = useOS((s) => s.reduceEffects);
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-fx", reduce);
  }, [reduce]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", appearance === "dark" || (appearance === "auto" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [appearance]);
  useEffect(() => {
    document.documentElement.classList.toggle("tinted", tinted);
  }, [tinted]);
}

// Turns the glass (and the appearance) on for as long as any OS surface is mounted.
export function useGlassScope() {
  useAppearance();
  useEffect(() => {
    if (scopes++ === 0) stopScope = installGlass();
    return () => {
      if (--scopes === 0) {
        stopScope?.();
        stopScope = null;
      }
    };
  }, []);
}

export type GlassTone = "bar" | "pop" | "dock" | "widget" | "widget-dark" | "lock" | "btn" | "btn-dark";
export const glass = (tone: GlassTone) => `glass glass-${tone}`;

export function Glass({ tone, className = "", children, ...rest }: { tone: GlassTone; className?: string; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-glass="" className={`${glass(tone)} ${className}`} {...rest}>
      {children}
    </div>
  );
}

// ---------- context menu (right-click), drawn in a portal so window transforms never clip or offset it ----------
export type MenuAction = { label: string; run: () => void; hint?: string; icon?: SymIcon } | "sep";
export function useContextMenu() {
  const [m, setM] = useState<{ x: number; y: number; items: MenuAction[] } | null>(null);
  useEffect(() => {
    if (!m) return;
    const off = () => setM(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && off();
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", off);
    };
  }, [m]);
  // `anchor`: the box of the thing the menu belongs to (a Dock icon): the menu then stands centred above it
  const open = (e: React.MouseEvent, items: MenuAction[], anchor?: DOMRect) => {
    e.preventDefault();
    e.stopPropagation();
    const h = items.reduce((a, it) => a + (it === "sep" ? 11 : 24), 10);
    const x = Math.max(8, Math.min(anchor ? anchor.left + anchor.width / 2 - 100 : e.clientX, window.innerWidth - 208));
    const y = anchor ? Math.max(32, anchor.top - h - 10) : Math.min(e.clientY, window.innerHeight - h - 8);
    setM({ x, y, items });
  };
  const node =
    m && typeof document !== "undefined"
      ? createPortal(
          <div
            onPointerDown={(e) => e.stopPropagation()}
            data-glass=""
            style={{ left: m.x, top: m.y }}
            className={`${glass("pop")} fixed z-[5000] w-[200px] rounded-[8px] p-[5px]`}
          >
            {m.items.map((it, i) =>
              it === "sep" ? (
                <div key={i} className="mx-[8px] my-[5px] h-px bg-black/[0.1]" />
              ) : (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    setM(null);
                    it.run();
                  }}
                  className="flex h-[24px] w-full items-center gap-[7px] rounded-[7px] px-[8px] text-left text-[13px] leading-none tracking-[-0.003em] text-ink hov:hover:bg-[#0A84FF] hov:hover:text-white"
                >
                  {m.items.some((x) => x !== "sep" && x.icon) && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{it.icon && <Sym icon={it.icon} size={15} />}</span>}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="opacity-45">{it.hint}</span>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )
      : null;
  return { open, node };
}

// ---------- OS sounds ----------
// The OS makes almost no sound: only the boot chime (Restart) and Shut Down, by request. Everything else is silent.
// Both go through sfx(); the engine (src/lib/sfx.ts) plugs in once with registerSfx(), and the Sound switch
// (Settings, Control Center) turns the chime and music off.
export type SfxName =
  | "boot" | "click" | "pop" | "open" | "close" | "minimize" | "zoom" | "error" | "notify"
  | "lock" | "unlock" | "type" | "page" | "whoosh" | "trash" | "shutdown";
type SfxEngine = { play: (n: SfxName) => void; setEnabled?: (on: boolean) => void; isEnabled?: () => boolean };
let sfxImpl: SfxEngine | null = null;
export function registerSfx(impl: SfxEngine) {
  sfxImpl = impl;
  // the engine remembers the choice across visits; the store follows it
  if (typeof window !== "undefined" && impl.isEnabled) useOS.getState().setSound(impl.isEnabled());
  useOS.subscribe((s, prev) => s.sound !== prev.sound && impl.setEnabled?.(s.sound));
}
// the engine: one line to swap
registerSfx({ play: (n) => playSfx(n), setEnabled: setSoundEnabled, isEnabled: isSoundEnabled });

export function sfx(name: SfxName) {
  if (typeof window === "undefined" || !useOS.getState().sound) return;
  try {
    sfxImpl?.play(name);
  } catch {}
}

// =====================================================================================================
// Design system primitives. Screens compose these; they don't restyle them.
// =====================================================================================================

export const SPRING = M.ui;
export const SPRING_SOFT = M.sheet;

// ---------- Squircle: Figma-style smoothed corners (smoothing 0.6) ----------
// The path math follows figma-squircle (MIT): each corner is a straight run, a cubic into a short circular arc,
// and a cubic out, with the smoothing capped by the space the side has.
const rad = (d: number) => (d * Math.PI) / 180;
function corner(r: number, smoothing: number, budget: number) {
  r = Math.min(r, budget);
  let s = smoothing;
  let p = (1 + s) * r;
  const maxS = budget / Math.max(r, 0.0001) - 1;
  s = Math.max(0, Math.min(s, maxS));
  p = Math.min(p, budget);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.sqrt(2);
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p3p4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  return { a, b, c, d, p, arc, r };
}
export function squirclePath(w: number, h: number, radius: number, smoothing = 0.6) {
  if (w <= 0 || h <= 0) return "";
  const k = corner(radius, smoothing, Math.min(w, h) / 2);
  const { a, b, c, d, p, arc, r } = k;
  const f = (n: number) => +n.toFixed(3);
  return [
    `M ${f(w - p)} 0`,
    `c ${f(a)} 0 ${f(a + b)} 0 ${f(a + b + c)} ${f(d)}`,
    `a ${f(r)} ${f(r)} 0 0 1 ${f(arc)} ${f(arc)}`,
    `c ${f(d)} ${f(c)} ${f(d)} ${f(b + c)} ${f(d)} ${f(a + b + c)}`,
    `L ${f(w)} ${f(h - p)}`,
    `c 0 ${f(a)} 0 ${f(a + b)} ${f(-d)} ${f(a + b + c)}`,
    `a ${f(r)} ${f(r)} 0 0 1 ${f(-arc)} ${f(arc)}`,
    `c ${f(-c)} ${f(d)} ${f(-(b + c))} ${f(d)} ${f(-(a + b + c))} ${f(d)}`,
    `L ${f(p)} ${f(h)}`,
    `c ${f(-a)} 0 ${f(-(a + b))} 0 ${f(-(a + b + c))} ${f(-d)}`,
    `a ${f(r)} ${f(r)} 0 0 1 ${f(-arc)} ${f(-arc)}`,
    `c ${f(-d)} ${f(-c)} ${f(-d)} ${f(-(b + c))} ${f(-d)} ${f(-(a + b + c))}`,
    `L 0 ${f(p)}`,
    `c 0 ${f(-a)} 0 ${f(-(a + b))} ${f(d)} ${f(-(a + b + c))}`,
    `a ${f(r)} ${f(r)} 0 0 1 ${f(arc)} ${f(-arc)}`,
    `c ${f(c)} ${f(-d)} ${f(b + c)} ${f(-d)} ${f(a + b + c)} ${f(-d)}`,
    "Z",
  ].join(" ");
}
const nativeSquircle = () => typeof CSS !== "undefined" && CSS.supports("corner-shape", "superellipse(2)");

// Gives any element smoothed corners at `radius`. Native corner-shape where the browser has it (cheap, keeps
// shadows); otherwise a measured SVG clip-path; if neither works, the plain border-radius stays.
export function useSquircle<T extends HTMLElement>(radius: number, smoothing = 0.6) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.borderRadius = `${radius}px`;
    el.setAttribute("data-sq", "");
    if (nativeSquircle()) return;
    let last = "";
    const apply = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const key = `${w}x${h}`;
      if (!w || !h || key === last) return;
      last = key;
      el.style.clipPath = `path("${squirclePath(w, h, radius, smoothing)}")`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      el.style.clipPath = "";
    };
  }, [radius, smoothing]);
  return ref;
}

export function Squircle({ radius = 12, className = "", style, children, ...rest }: { radius?: number; className?: string; style?: React.CSSProperties; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useSquircle<HTMLDivElement>(radius);
  return (
    <div ref={ref} className={className} style={{ borderRadius: radius, ...style }} {...rest}>
      {children}
    </div>
  );
}

// ---------- TabBar: the phone's floating glass tab bar ----------
// iOS 26: a capsule of glass above the home indicator; the selected tab is a clearer drop that slides between
// the tabs on the glass spring.
export function TabBar<T extends string>({ id, value, onChange, items }: { id: string; value: T; onChange: (v: T) => void; items: { value: T; label: string; icon: ReactNode }[] }) {
  return (
    <nav
      aria-label="Sections"
      data-glass=""
      className="glass glass-pop fixed inset-x-3 bottom-[calc(var(--phone-bottom)+2px)] z-[30] flex h-[60px] items-stretch rounded-full p-1"
    >
      <GlassThumb index={items.findIndex((it) => it.value === value)} className="inset-y-1 rounded-full bg-[var(--fill)]" />
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            type="button"
            key={it.value}
            aria-current={on ? "page" : undefined}
            data-seg=""
            data-tab={id}
            onClick={() => onChange(it.value)}
            className={`tab-item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full transition-colors duration-200 ${on ? "text-[var(--accent-text)]" : "text-ink-2"}`}
          >
            <span className="relative">{it.icon}</span>
            <span className="relative max-w-full truncate px-1 text-[10px] font-semibold leading-none">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- GlassMenu: a capsule that grows into its menu ----------
// Liquid Glass controls morph: the button doesn't open a separate popover, it becomes one. The same surface
// stretches from the capsule to the list (a layout spring) and the rows fade in once there is room.
export function GlassMenu<T extends string>({ label, icon, value, options, onChange, align = "right" }: { label: string; icon?: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const cur = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative h-8 shrink-0">
      {/* an invisible twin holds the capsule's place in the toolbar; the glass itself is free to grow over the content */}
      <span aria-hidden className="m-body invisible flex h-8 items-center gap-1.5 whitespace-nowrap px-3 font-medium">
        {icon}
        {cur?.label ?? label}
      </span>
      <motion.div
        layout
        transition={SPRING_GLASS}
        style={{ borderRadius: 16 }}
        data-glass=""
        className={`glass glass-pop glass-menu absolute top-0 z-[80] overflow-hidden ${align === "right" ? "right-0" : "left-0"} ${open ? "is-open w-[184px] p-[5px]" : "w-max"}`}
      >
        {open ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16, delay: 0.06 }} role="menu" aria-label={label}>
            <div className="m-sub flex h-6 items-center px-2.5 font-semibold text-ink-3">{label}</div>
            {options.map((o) => (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={o.value === value}
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="m-body flex h-7 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-ink hov:hover:bg-[var(--accent)] hov:hover:text-white"
              >
                <span className="w-3 shrink-0 text-[11px]">{o.value === value ? "✓" : ""}</span>
                {o.label}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.button layout="position" type="button" aria-haspopup="menu" aria-expanded={false} aria-label={`${label}: ${cur?.label ?? ""}`} onClick={() => setOpen(true)} className="m-body flex h-8 items-center gap-1.5 whitespace-nowrap px-3 font-medium text-ink">
            {icon}
            {cur?.label ?? label}
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}

// ---------- Btn: the only button ----------
export type BtnVariant = "bordered" | "prominent" | "tinted" | "plain" | "glass" | "glass-dark";
export type BtnSize = "sm" | "md" | "lg";
export function Btn({
  children,
  variant = "bordered",
  size = "md",
  capsule = false,
  icon,
  iconOnly = false,
  href,
  onClick,
  label,
  disabled,
  className = "",
  type = "button",
}: {
  children?: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  capsule?: boolean;
  icon?: ReactNode;
  iconOnly?: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const radius = capsule ? 999 : size === "sm" ? 8 : size === "md" ? 10 : 16;
  const glassy = variant === "glass" || variant === "glass-dark";
  const cls = `btn btn-${size} btn-${variant} ${capsule ? "btn-capsule" : ""} ${iconOnly ? "btn-icon" : ""} ${glassy ? `glass ${variant === "glass" ? "glass-btn" : "glass-btn-dark"}` : ""} ${className}`;
  const inner = (
    <>
      {icon}
      {!iconOnly && children}
    </>
  );
  const sq = !capsule ? { "data-sq": "" } : {};
  if (href)
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" aria-label={label} className={cls} style={{ borderRadius: radius }} {...(glassy ? { "data-glass": "" } : {})} {...sq}>
        {inner}
      </a>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={label} className={cls} style={{ borderRadius: radius }} {...(glassy ? { "data-glass": "" } : {})} {...sq}>
      {inner}
    </button>
  );
}

// ---------- lists, stats, info ----------
export function List({ children, mac = false, className = "" }: { children: ReactNode; mac?: boolean; className?: string }) {
  return (
    <Squircle radius={mac ? 12 : 16} className={`list ${mac ? "m-list shadow-[var(--shadow-1)]" : ""} ${className}`}>
      {children}
    </Squircle>
  );
}
export function ListRow({ icon, title, sub, detail, chevron, href, onClick, mac = false }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; detail?: ReactNode; chevron?: boolean; href?: string; onClick?: () => void; mac?: boolean }) {
  const body = (
    <>
      {icon}
      <span className="list-body">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[var(--label)] ${mac ? "m-body" : "t-body"}`}>{title}</span>
          {sub && <span className={`block truncate text-[var(--label-2)] ${mac ? "m-sub" : "t-foot"}`}>{sub}</span>}
        </span>
        {detail && <span className={`shrink-0 text-[var(--label-2)] ${mac ? "m-body" : "t-body"}`}>{detail}</span>}
        {chevron && <Sym icon={ChevronRight} size={mac ? 14 : 20} className={`${mac ? "-mr-1" : "-mr-1.5"} shrink-0 text-[var(--label-3)]`} weight="semibold" />}
      </span>
    </>
  );
  const cls = "list-row press-row w-full text-left";
  if (href)
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className={cls}>
        {body}
      </a>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  return <div className="list-row">{body}</div>;
}
export function IconTile({ color, children, size = 29 }: { color: string; children: ReactNode; size?: number }) {
  return (
    <Squircle radius={size * 0.24} className="icon-tile" style={{ width: size, height: size, background: color }}>
      {children}
    </Squircle>
  );
}
export function SectionHeader({ children, mac = false }: { children: ReactNode; mac?: boolean }) {
  return <div className={mac ? "m-headline mb-1.5 px-1 text-[var(--label)]" : "t-foot mb-[7px] px-4 uppercase text-[var(--label-2)]"}>{children}</div>;
}
export function StatsRow({ stats }: { stats: { k: string; v: string; sub?: string }[] }) {
  const { compact } = useChrome();
  if (!stats.length) return null;
  // four figures do not fit across a phone with their labels whole: there they stand two by two
  const cols = compact && stats.length > 3 ? 2 : stats.length;
  return (
    <div className="grid gap-y-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {stats.map((s, i) => (
        // a long label takes a second line instead of being cut; the figures still share one line (labels sit on it)
        <div key={s.k} className={`flex min-w-0 flex-col justify-end px-2 text-center ${i % cols ? "shadow-[inset_0.5px_0_0_var(--separator-opaque)]" : ""}`}>
          <div className="t-cap2 line-clamp-2 font-semibold uppercase text-[var(--label-2)] [text-wrap:balance]">{s.k}</div>
          <div className="t-title3 mt-1 truncate font-bold text-[var(--label-2)]">{s.v}</div>
          {s.sub && <div className="t-cap mt-0.5 truncate text-[var(--label-3)]">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}
export function InfoGrid({ rows, cols = 2 }: { rows: { k: string; v: ReactNode }[]; cols?: 1 | 2 }) {
  return (
    <dl className={`grid ${cols === 2 ? "grid-cols-2 gap-x-8 @max-[519px]:grid-cols-1" : "grid-cols-1"}`}>
      {rows.map((f) => (
        <div key={f.k} className="t-sub flex items-baseline justify-between gap-4 py-3 shadow-[inset_0_-0.5px_0_var(--separator-opaque)]">
          <dt className="text-[var(--label-2)]">{f.k}</dt>
          <dd className="text-right text-[var(--label)]">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}
