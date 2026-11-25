"use client";

import { SystemMenuMark } from "./Mark";
import {
  AnimatePresence,
  Reorder,
  animate,
  motion,
  useAnimation,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { AppWindow, Eye, Info, LayoutGrid, List, Minus, Moon, Power, RotateCcw, Search, Settings, Settings2, Trash2, X } from "lucide-react";
import { Sym, type SymIcon } from "./symbols";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { about, allApps, apps, minSize, desktopItems, dockApps, gallery, mainWork, owner, places, projectApps, projectGroups, projects, deskSharedApps, timeline, type AppId, type DeskItem, type UserId } from "@/content";
import { focusedApp, isUp, useOS, useWallpaper, type Win } from "@/store";
import { AppIcon, AppView, LiveWallpaper, warmApps } from "./Apps";
import { DocArt, FolderArt, TrashArt } from "./icons";
import { Bars, DeskArt, Monogram, Resume } from "./shell";
import { Btn, Chrome, EASE_OUT, FILE_MIME, M, QuickLook, Segmented, glass, reducedMotion, sfx, useContextMenu, useGlassScope, useLiveInterval, useMorph, type LookItem, type MenuAction } from "./ui";
import { useClock } from "./useClock";
import { EDGES, EDGE_CURSOR, EDGE_ZONE, clampMove, pointerGesture, resizeRect, type Bounds, type Edge } from "./windowFrame";

// ---------- menu bar ----------

function useOutside(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const off = () => close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [open, close]);
}

// A menu grows out of the title that opened it: the glass starts small at the title and springs to size, and
// goes back the way it came. Control Center and Notification Center do the same from their icons, further.
// The refraction filter is off while it moves (useMorph).
function Pop({ open, align = "left", width = 220, panel = false, children }: { open: boolean; align?: "left" | "right"; width?: number; panel?: boolean; children: ReactNode }) {
  const morph = useMorph<HTMLDivElement>();
  const reduce = reducedMotion();
  // a menu is opened all day: it only settles the last few percent from its title. A panel is a drop of glass
  // let out of its icon, and may travel further.
  const from = reduce ? 1 : panel ? 0.5 : 0.96;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          {...morph}
          initial={{ opacity: 0, scale: from }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduce ? 1 : panel ? 0.8 : 0.98, transition: M.out }}
          transition={panel ? M.glass : M.pop}
          onPointerDown={(e) => e.stopPropagation()}
          data-glass=""
          style={{ width, transformOrigin: align === "left" ? "18px -11px" : "calc(100% - 18px) -11px" }}
          className={`${glass("pop")} absolute top-[23px] z-[3000] ${panel ? "sq-panel rounded-[20px] p-2.5" : "rounded-[8px] p-[5px]"} ${align === "left" ? "left-0" : "right-0"}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A menu row, as Tahoe draws it: a symbol in its own column, the title, the shortcut at the far edge.
function MenuItem({ children, onClick, hint, href, icon }: { children: ReactNode; onClick?: () => void; hint?: string; href?: string; icon?: ReactNode }) {
  const cls = "flex h-[24px] w-full items-center gap-[7px] rounded-[7px] px-[8px] text-left text-[13px] leading-none tracking-[-0.003em] text-ink hov:hover:bg-[#0A84FF] hov:hover:text-white";
  const inner = (
    <>
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[13px] tracking-[0.04em] opacity-45">{hint}</span>}
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

const Sep = () => <div className="mx-[8px] my-[5px] h-px bg-black/[0.1]" />;
const msym = (icon: SymIcon) => <Sym icon={icon} size={15} />;

function ControlCenter({ close }: { close: () => void }) {
  const { sound, setSound, playing, lockScreen, appearance, setAppearance } = useOS();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-[20px] bg-white/60 dark:bg-white/10 px-3 py-2.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.06)]">
        <span className="text-[12px] font-semibold text-ink">Appearance</span>
        <Segmented
          id="cc-appearance"
          value={appearance}
          onChange={setAppearance}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSound(!sound)}
          className="press flex h-[64px] flex-col justify-between rounded-[16px] bg-white/60 dark:bg-white/10 p-2.5 text-left shadow-[0_0_0_0.5px_rgb(0_0_0/0.06)]"
        >
          <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full ${sound ? "bg-[#0A84FF] text-white" : "bg-black/[0.08] text-ink"}`}>
            <Sym icon={sound ? "speaker2" : "speakerOff"} size={15} weight="medium" />
          </span>
          <span className="text-[12px] font-semibold leading-none text-ink">Sound</span>
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            lockScreen();
          }}
          className="press flex h-[64px] flex-col justify-between rounded-[16px] bg-white/60 dark:bg-white/10 p-2.5 text-left shadow-[0_0_0_0.5px_rgb(0_0_0/0.06)]"
        >
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/[0.08] text-ink">
            <Sym icon="lock" size={14} weight="medium" />
          </span>
          <span className="text-[12px] font-semibold leading-none text-ink">Lock Screen</span>
        </button>
      </div>
      {playing && (
        <div className="flex items-center gap-2.5 rounded-[16px] bg-white/60 dark:bg-white/10 px-3 py-2.5 shadow-[0_0_0_0.5px_rgb(0_0_0/0.06)]">
          <Bars />
          <div className="min-w-0">
            <div className="text-[11px] leading-[14px] text-ink-3">Now Playing</div>
            <div className="truncate text-[13px] font-semibold leading-[16px] text-ink">{playing}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Notification Center: a few widgets under the clock ----------

function Widget({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-sq=""
      className={`press block w-full rounded-[22px] bg-white/60 p-3.5 text-left shadow-[0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-white/10 ${className}`}
    >
      {children}
    </button>
  );
}

// the four that matter most, newest last
const milestones = timeline.filter((m) => m.key);

function NotificationCenter({ close }: { close: () => void }) {
  const { playing, open } = useOS();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, []);
  const go = (id: AppId) => () => {
    close();
    open(id);
  };
  const h = now.getHours() % 12;
  const m = now.getMinutes();
  const sec = now.getSeconds();
  const hand = (deg: number, len: number, w: number, c: string) => (
    <line x1="50" y1="50" x2={50 + Math.sin((deg * Math.PI) / 180) * len} y2={50 - Math.cos((deg * Math.PI) / 180) * len} stroke={c} strokeWidth={w} strokeLinecap="round" />
  );
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <Widget className="aspect-square">
          <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="Clock">
            <circle cx="50" cy="50" r="47" fill="var(--bg-elevated)" stroke="var(--separator-opaque)" />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="50" y1="8" x2="50" y2={i % 3 ? 11 : 14} stroke="var(--label-3s)" strokeWidth={i % 3 ? 1 : 2} strokeLinecap="round" transform={`rotate(${i * 30} 50 50)`} />
            ))}
            {hand(h * 30 + m / 2, 24, 3.4, "var(--label)")}
            {hand(m * 6, 34, 2.4, "var(--label)")}
            {hand(sec * 6, 37, 1, "#FF9500")}
            <circle cx="50" cy="50" r="2.4" fill="#FF9500" />
          </svg>
        </Widget>
        <Widget className="flex aspect-square flex-col justify-between">
          <div className="eyebrow !text-[11px] text-[#FF3B30]">{now.toLocaleDateString("en-GB", { weekday: "long" })}</div>
          <div>
            <div className="text-[44px] font-light leading-none tracking-[-0.03em] text-ink">{now.getDate()}</div>
            <div className="m-body mt-1 text-ink-2">{now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</div>
          </div>
        </Widget>
      </div>
      <Widget onClick={go("larpo")}>
        <div className="eyebrow !text-[11px] text-ink-3">Currently working on</div>
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mainWork.image} alt="" className="h-12 w-[76px] rounded-[10px] object-cover object-top shadow-[0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <div className="min-w-0">
            <div className="t-headline truncate text-ink">{mainWork.name}</div>
            <div className="m-body truncate text-ink-2">{mainWork.role}</div>
          </div>
        </div>
      </Widget>
      <Widget
        onClick={() => {
          useOS.getState().setSettingsPane("about");
          go("settings")();
        }}
      >
        <div className="eyebrow !text-[11px] text-ink-3">Milestones</div>
        <ol className="mt-2.5">
          {milestones.map((m, i) => (
            <li key={m.title} className="relative flex gap-3 pb-2.5 last:pb-0">
              {/* the rail: a dot per milestone, joined by a hairline */}
              <span className="relative flex w-[7px] shrink-0 justify-center">
                {i < milestones.length - 1 && <span className="absolute bottom-[-10px] top-[9px] w-px bg-[var(--separator-opaque)]" />}
                <span className={`relative mt-[5px] h-[7px] w-[7px] rounded-full ${i === milestones.length - 1 ? "bg-[var(--accent)]" : "bg-[var(--label-3s)]"}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="m-headline block truncate text-ink">{m.title}</span>
                <span className="m-sub block text-ink-2">{m.when}</span>
              </span>
            </li>
          ))}
        </ol>
      </Widget>
      {playing && (
        <Widget onClick={go("records")} className="flex items-center gap-3">
          <Bars />
          <div className="min-w-0">
            <div className="eyebrow !text-[11px] text-ink-3">Now Playing</div>
            <div className="t-headline truncate text-ink">{playing}</div>
          </div>
        </Widget>
      )}
    </div>
  );
}

// ---------- Apps (Launchpad) and the window overview (Mission Control) ----------

function AppsOverlay() {
  const overlay = useOS((s) => s.overlay);
  const setOverlay = useOS((s) => s.setOverlay);
  const open = useOS((s) => s.open);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (overlay !== "apps") setQ("");
  }, [overlay]);
  const all: AppId[] = [...allApps, "trash"];
  const list = all.filter((id) => apps[id].title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <AnimatePresence>
      {overlay === "apps" && (
        <motion.div
          key="apps"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: M.out }}
          transition={M.fade}
          onPointerDown={(e) => e.target === e.currentTarget && setOverlay(null)}
          className="absolute inset-0 z-[1800] flex flex-col items-center bg-black/25 pt-[11vh] [backdrop-filter:blur(36px)_saturate(1.6)]"
        >
          <motion.div initial={{ scale: reducedMotion() ? 1 : 1.08 }} animate={{ scale: 1 }} exit={{ scale: reducedMotion() ? 1 : 1.04 }} transition={M.ui} className="flex w-full flex-col items-center" onPointerDown={(e) => e.target === e.currentTarget && setOverlay(null)}>
            <label htmlFor="apps-search" className="flex h-9 w-[260px] items-center gap-2 rounded-full bg-white/15 px-3 text-white/70 shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.25)]">
              <Sym icon={Search} size={14} weight="medium" />
              <input id="apps-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/55" />
            </label>
            <div className="mt-[7vh] flex w-[min(1000px,86vw)] flex-wrap justify-center gap-x-3 gap-y-9">
              {list.map((id, i) => (
                <motion.button
                  type="button"
                  key={id}
                  whileTap={{ scale: 0.96 }}
                  transition={M.pop}
                  onClick={() => {
                    setOverlay(null);
                    open(id);
                  }}
                  className="flex w-[112px] flex-col items-center gap-2 outline-none"
                >
                  {id === "trash" ? <TrashArt size={76} /> : <AppIcon id={id} size={76} />}
                  <span className="max-w-full truncate text-[13px] font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]">{apps[id].title}</span>
                </motion.button>
              ))}
            </div>
            {!list.length && <div className="mt-16 text-[15px] text-white/70">{`No apps match “${q.trim()}”`}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A live thumbnail of a window: a clone of its DOM, scaled down with a transform. Cheap (no canvas capture), and it
// shows exactly what the window shows. An embedded site can't be cloned without loading it again, so its frame is
// swapped for the project's picture; a canvas gets its pixels copied across.
const THUMB_W = 400;
const THUMB_H = 236;
function WindowThumb({ id }: { id: AppId }) {
  const host = useRef<HTMLDivElement>(null);
  const fallback = apps[id].size;
  const [box, setBox] = useState(() => {
    const k = Math.min(THUMB_W / Math.max(fallback.w, 1), THUMB_H / Math.max(fallback.h, 1));
    return { w: Math.round(fallback.w * k), h: Math.round(fallback.h * k), live: false };
  });
  useLayoutEffect(() => {
    const el = host.current;
    const src = document.querySelector<HTMLElement>(`[data-win="${id}"]`);
    if (!el || !src) return;
    const sw = src.offsetWidth;
    const sh = src.offsetHeight;
    if (!sw || !sh) return;
    const k = Math.min(THUMB_W / sw, THUMB_H / sh);
    const clone = src.cloneNode(true) as HTMLElement;
    // remember where each scroller was, and carry canvas pixels over, while the two trees still line up
    const a = src.querySelectorAll<HTMLElement>("*");
    const b = clone.querySelectorAll<HTMLElement>("*");
    const scrolls: [HTMLElement, number][] = [];
    a.forEach((n, i) => {
      if (n.scrollTop > 0 && b[i]) scrolls.push([b[i], n.scrollTop]);
      if (n instanceof HTMLCanvasElement && b[i] instanceof HTMLCanvasElement) {
        try {
          (b[i] as HTMLCanvasElement).getContext("2d")?.drawImage(n, 0, 0);
        } catch {}
      }
    });
    const art = projects[id]?.image;
    clone.querySelectorAll("iframe").forEach((f) => {
      const still = document.createElement("div");
      still.style.cssText = `position:absolute;inset:0;background:${art ? `url(${art}) center top / cover` : "var(--bg)"}`;
      f.replaceWith(still);
    });
    clone.querySelectorAll("audio,video,script").forEach((n) => n.remove());
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    clone.removeAttribute("data-win");
    clone.setAttribute("inert", "");
    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, { position: "absolute", left: "0", top: "0", width: `${sw}px`, height: `${sh}px`, transform: `scale(${k})`, transformOrigin: "0 0", opacity: "1", boxShadow: "none", pointerEvents: "none" });
    el.replaceChildren(clone);
    scrolls.forEach(([n, y]) => (n.scrollTop = y));
    setBox({ w: Math.round(sw * k), h: Math.round(sh * k), live: true });
    return () => el.replaceChildren();
  }, [id]);
  return (
    <div className="relative overflow-hidden rounded-[inherit] bg-[var(--bg)]" style={{ width: box.w, height: box.h }}>
      <div ref={host} className="absolute inset-0" />
      {!box.live && (
        <div className="absolute inset-0 flex items-center justify-center">
          <AppIcon id={id} size={56} />
        </div>
      )}
    </div>
  );
}

function MissionControl() {
  const overlay = useOS((s) => s.overlay);
  const setOverlay = useOS((s) => s.setOverlay);
  const windows = useOS((s) => s.windows);
  const { open, close } = useOS();
  const live = [...windows].sort((a, b) => b.z - a.z);
  return (
    <AnimatePresence>
      {overlay === "mission" && (
        <motion.div
          key="mission"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: M.out }}
          transition={M.fade}
          onPointerDown={(e) => e.target === e.currentTarget && setOverlay(null)}
          className="absolute inset-0 z-[1800] flex flex-col items-center bg-black/30 px-10 pt-[8vh] [backdrop-filter:blur(30px)_saturate(1.5)]"
        >
          <div className="eyebrow text-white/65">{live.length ? `${live.length} open window${live.length > 1 ? "s" : ""}` : "No open windows"}</div>
          <div className="mt-8 flex w-full max-w-[1320px] flex-wrap items-start justify-center gap-x-8 gap-y-9" onPointerDown={(e) => e.target === e.currentTarget && setOverlay(null)}>
            {live.map((w, i) => (
              <motion.div key={w.id} initial={{ scale: reducedMotion() ? 1 : 1.08 }} animate={{ scale: 1 }} transition={M.ui} className="group relative flex flex-col items-center gap-3">
                <button
                  type="button"
                  aria-label={`Show ${apps[w.id].title}`}
                  onClick={() => {
                    setOverlay(null);
                    open(w.id);
                  }}
                  className={`press sq-list relative rounded-[16px] shadow-[0_0_0_0.5px_rgb(255_255_255/0.22),0_24px_50px_-18px_rgb(0_0_0/0.65)] outline-none transition-shadow duration-150 hov:hover:shadow-[0_0_0_3px_var(--accent),0_24px_50px_-18px_rgb(0_0_0/0.65)] focus-visible:shadow-[0_0_0_3px_var(--accent),0_24px_50px_-18px_rgb(0_0_0/0.65)] ${w.min ? "opacity-70" : ""}`}
                >
                  <WindowThumb id={w.id} />
                </button>
                <div className="flex items-center gap-2">
                  <AppIcon id={w.id} size={22} />
                  <span className="text-[13px] font-medium text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.4)]">{apps[w.id].title}</span>
                  {w.min && <span className="text-[12px] text-white/55">Minimised</span>}
                </div>
                <button
                  type="button"
                  aria-label={`Close ${apps[w.id].title}`}
                  onClick={() => close(w.id)}
                  className="absolute -left-2.5 -top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-ink opacity-0 shadow-[var(--shadow-2)] transition-opacity duration-150 focus-visible:opacity-100 hov:group-hover:opacity-100"
                >
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuBar() {
  const { windows, setPalette, shutdown, playing, open, sleep, restart, lockScreen } = useOS();
  const [menu, setMenu] = useState<null | "a" | "go" | "cc" | "nc">(null);
  const close = () => setMenu(null);
  useOutside(menu !== null, close);
  const time = useClock();
  const f = focusedApp(windows);
  const item = (m: "a" | "go" | "cc" | "nc") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      setMenu(menu === m ? null : m);
    },
    onPointerEnter: () => menu && menu !== m && setMenu(m),
    // the same from the keyboard: the titles open on press for a pointer, so they need their own key handling
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
      e.preventDefault();
      setMenu(menu === m ? null : m);
    },
  });
  const run = (fn: () => void) => () => {
    close();
    fn();
  };
  const btn = (on: boolean) => `flex h-[22px] items-center rounded-[7px] px-[9px] ${on ? "bg-black/[0.1]" : ""}`;

  return (
    <motion.div
      initial={{ y: -30 }}
      animate={{ y: 0 }}
      transition={{ ...M.arrive, delay: 0.1 }}
      className="relative z-[2000] flex h-[24px] items-center justify-between px-2.5 text-[13px] tracking-[-0.003em] text-ink"
    >
      {/* the material is its own layer: a glass parent would cut the menus' blur off from the desktop */}
      <div aria-hidden data-glass="" className={`${glass("bar")} pointer-events-none absolute inset-0 rounded-none`} />
      <div className="relative flex items-center gap-px">
        <div className="relative">
          <button type="button" aria-label="Augustas OS menu" aria-haspopup="menu" aria-expanded={menu === "a"} className={btn(menu === "a")} {...item("a")}>
            <SystemMenuMark className="text-ink" />
          </button>
          <Pop open={menu === "a"}>
            <MenuItem icon={msym(Info)} onClick={run(() => open("about"))}>About Augustas</MenuItem>
            <Sep />
            <MenuItem icon={msym(Settings)} onClick={run(() => open("settings"))}>System Settings…</MenuItem>
            <Sep />
            <MenuItem icon={msym(Moon)} onClick={run(() => sleep(true))}>Sleep</MenuItem>
            <MenuItem icon={msym(RotateCcw)} onClick={run(restart)}>Restart</MenuItem>
            <MenuItem icon={msym(Power)} onClick={run(() => (sfx("shutdown"), shutdown()))}>Shut Down</MenuItem>
            <Sep />
            <MenuItem icon={msym("lock")} onClick={run(() => (lockScreen()))} hint="⌃⌘Q">
              Lock Screen
            </MenuItem>
          </Pop>
        </div>
        <span className="px-[9px] font-bold">{f ? apps[f].title : "Finder"}</span>
        <div className="relative">
          <button type="button" aria-haspopup="menu" aria-expanded={menu === "go"} className={btn(menu === "go")} {...item("go")}>
            Go
          </button>
          <Pop open={menu === "go"} width={210}>
            {dockApps.map((id) => (
              <MenuItem key={id} icon={<AppIcon id={id} size={16} flat />} onClick={run(() => open(id))}>
                {apps[id].title}
              </MenuItem>
            ))}
            <Sep />
            {deskSharedApps.map((id) => (
              <MenuItem key={id} icon={<AppIcon id={id} size={16} flat />} onClick={run(() => open(id))}>
                {apps[id].title}
              </MenuItem>
            ))}
            <Sep />
            <MenuItem icon={msym(List)} href="/work">View as List</MenuItem>
          </Pop>
        </div>
      </div>
      <div className="relative flex items-center gap-px">
        <AnimatePresence>
          {playing && (
            <motion.span
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: M.out }}
              transition={M.fade}
              className="mr-1 flex items-center gap-1.5 px-2 text-[13px]"
            >
              <Bars /> {playing}
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          aria-label="Search"
          onClick={() => {
            setPalette(true);
          }}
          className={btn(false)}
        >
          <Sym icon={Search} size={15} weight="medium" />
        </button>
        <div className="relative">
          <button type="button" aria-label="Control Center" aria-haspopup="dialog" aria-expanded={menu === "cc"} className={btn(menu === "cc")} {...item("cc")}>
            <Sym icon={Settings2} size={16} weight="medium" />
          </button>
          <Pop open={menu === "cc"} align="right" width={300} panel>
            <ControlCenter close={close} />
          </Pop>
        </div>
        <div className="relative">
          <button type="button" aria-label={`${time}, Notification Center`} aria-haspopup="dialog" aria-expanded={menu === "nc"} className={`${btn(menu === "nc")} tabular-nums`} {...item("nc")}>
            {time}
          </button>
          <Pop open={menu === "nc"} align="right" width={340} panel>
            <NotificationCenter close={close} />
          </Pop>
        </div>
      </div>
    </motion.div>
  );
}


// ---------- windows ----------

const LIGHTS = [
  { k: "close", c: "#FF5F57", g: "M3 3l6 6M9 3l-6 6" },
  { k: "min", c: "#FEBC2E", g: "M2.5 6h7" },
  { k: "max", c: "#28C840", g: "M6 2.5v7M2.5 6h7" },
] as const;

// Dock icons register here so windows can open from, and minimise into, them.
const dockEls = new Map<AppId, HTMLElement>();
function dockCenter(id: AppId) {
  const r = dockEls.get(id)?.getBoundingClientRect();
  return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight - 40 };
}

type Rect = { left: number; top: number; w: number; h: number };
const MIN_W = 320;
const MIN_H = 220;
const DOCK_SPACE = 92;
// Where a window may be: under the menu bar (the layer starts below it), 12px off the sides, above the dock.
function winBounds(W: number, H: number): Bounds {
  return { left: 12, top: 8, right: W - 12, bottom: H - DOCK_SPACE };
}
// Keep every window fully on screen, above the dock, never smaller than the minimum. Dragging and resizing use the
// same bounds, so letting go never makes a window jump.
function clampRect(r: Rect, W: number, H: number, min = { w: MIN_W, h: MIN_H }): Rect {
  const b = winBounds(W, H);
  const w = Math.max(Math.min(r.w, b.right - b.left), Math.min(min.w, b.right - b.left));
  const h = Math.max(Math.min(r.h, b.bottom - b.top), Math.min(min.h, b.bottom - b.top));
  return clampMove({ left: r.left, top: r.top, w, h }, b);
}

function Window({ win, index, area, focused }: { win: Win; index: number; area: RefObject<HTMLDivElement | null>; focused: boolean }) {
  // each app has its own floor (content.ts): a window never gets smaller than its layout can take
  const min = minSize(win.id);
  const { focus, close, toggleMin, toggleMax } = useOS();
  const app = apps[win.id];
  const outer = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const size = app.size ?? { w: 560, h: 420 };
  const areaSize = () => ({ W: area.current?.clientWidth ?? window.innerWidth, H: area.current?.clientHeight ?? window.innerHeight - 24 });
  const [rect, setRect] = useState<Rect>(() => {
    const { W, H } = areaSize();
    // the designed size, never more than 88% of the space; the first window sits dead centre (a touch above, like
    // macOS), later ones cascade down-right from it
    let w = Math.round(Math.min(size.w, (W - 24) * 0.88));
    let h = Math.round(Math.min(size.h, (H - DOCK_SPACE - 16) * 0.94));
    // a touch tablet (iPadOS): an app opens nearly full screen, as iPad apps do, and can still be resized into a
    // window; the games and small tools keep their own size
    const tablet = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) >= 700;
    if (tablet && !(index === 0 && win.id === "records") && !["piano", "about", "terminal", "game", "trash", "doom"].includes(win.id)) {
      w = Math.round(W - 32);
      h = Math.round(H - DOCK_SPACE - 20);
      return clampRect({ left: 16, top: 8, w, h }, W, H, min);
    }
    const step = index % 6;
    // The window the desktop opens with sits beside the note, never over it: between the note and the column of
    // icons where there is room, between the note and the edge on a smaller screen (it gives up some width for
    // that, down to its two-column layout). Only a screen too narrow for both lets it take the middle.
    const first = index === 0 && win.id === "records";
    const room = W - (NOTE_W + 48) - 24;
    const clear = room - (CELL_W + 8);
    const beside = first && room >= 640;
    const span = clear >= 640 ? clear : room;
    if (beside) w = Math.min(w, span);
    const x0 = beside ? NOTE_W + 48 + (span - w) / 2 : (W - w) / 2;
    return clampRect({ left: Math.round(x0 + step * 28), top: Math.round((H - DOCK_SPACE - h) * 0.42 + step * 24), w, h }, W, H, min);
  });
  const [hidden, setHidden] = useState(false);
  // zoom is a FLIP: the window jumps to its new frame, then a transform carries it from the old one (no animated layout)
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fsx = useMotionValue(1);
  const fsy = useMotionValue(1);
  const before = useRef<DOMRect | null>(null);
  // fold a finished drag into the rect, then clamp
  const settle = () => {
    const { W, H } = areaSize();
    setRect((r) => clampRect({ ...r, left: r.left + x.get(), top: r.top + y.get() }, W, H, min));
    x.set(0);
    y.set(0);
  };
  useEffect(() => {
    const onResize = () => settle();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    const a = before.current;
    const el = outer.current;
    before.current = null;
    if (!a || !el) return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    fx.set(a.left - b.left);
    fy.set(a.top - b.top);
    fsx.set(a.width / b.width);
    fsy.set(a.height / b.height);
    const spring = M.ui;
    animate(fx, 0, spring);
    animate(fy, 0, spring);
    animate(fsx, 1, spring);
    animate(fsy, 1, spring);
  }, [win.max, fx, fy, fsx, fsy]);
  const zoom = () => {
    before.current = outer.current?.getBoundingClientRect() ?? null;
    // fold any drag offset into the frame first, so the measured "after" frame has no leftover transform
    const { W, H } = areaSize();
    const dx = x.get();
    const dy = y.get();
    x.set(0);
    y.set(0);
    if (dx || dy) setRect((r) => clampRect({ ...r, left: r.left + dx, top: r.top + dy }, W, H, min));
    toggleMax(win.id);
  };
  useEffect(() => {
    if (!win.min) setHidden(false);
  }, [win.min]);

  // Offset from the window's centre to its dock icon: windows open out of it and minimise into it.
  const toDock = () => {
    const c = dockCenter(win.id);
    const r = outer.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 300 };
    return { x: c.x - (r.x + r.width / 2), y: c.y - (r.y + r.height / 2) };
  };
  const [from] = useState(() => {
    const c = dockCenter(win.id);
    return { x: c.x - (rect.left + rect.w / 2), y: c.y - (24 + rect.top + rect.h / 2) };
  });
  const [minTo, setMinTo] = useState({ x: 0, y: 300 });
  useEffect(() => {
    if (win.min) setMinTo(toDock());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.min]);

  // Move by the title bar and resize from any edge or corner (windowFrame.ts): the pointer is captured, every
  // frame is written straight to the element (a transform while moving, the frame while resizing) and React only
  // hears about it when the pointer lets go. A move keeps the grab point under the pointer; both stay in bounds.
  const startMove = (e: React.PointerEvent) => {
    const { W, H } = areaSize();
    const b = winBounds(W, H);
    const r0 = { ...rect };
    const at = (dx: number, dy: number) => clampMove({ ...r0, left: r0.left + dx, top: r0.top + dy }, b);
    pointerGesture(
      e,
      "default",
      (dx, dy) => {
        const r = at(dx, dy);
        x.set(r.left - r0.left);
        y.set(r.top - r0.top);
      },
      (dx, dy) => {
        const r = at(dx, dy);
        const o = outer.current;
        // the frame takes the position before the transform lets go of it, so there is no frame in between
        if (o) {
          o.style.left = `${r.left}px`;
          o.style.top = `${r.top}px`;
        }
        x.set(0);
        y.set(0);
        setRect(r);
      },
      3,
    );
  };
  const startResize = (edge: Edge) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    focus(win.id);
    const { W, H } = areaSize();
    const b = winBounds(W, H);
    const max = { w: b.right - b.left, h: b.bottom - b.top };
    const r0 = { ...rect };
    const paint = (r: Rect) => {
      const o = outer.current;
      if (!o) return;
      o.style.left = `${r.left}px`;
      o.style.top = `${r.top}px`;
      o.style.width = `${r.w}px`;
      o.style.height = `${r.h}px`;
    };
    pointerGesture(
      e,
      EDGE_CURSOR[edge],
      (dx, dy) => paint(resizeRect(r0, edge, dx, dy, min, max, b)),
      (dx, dy) => {
        const r = resizeRect(r0, edge, dx, dy, min, max, b);
        paint(r);
        setRect(r);
      },
    );
  };

  const live = !win.min;
  const act = {
    close: () => {
      close(win.id);
    },
    min: () => {
      toggleMin(win.id);
    },
    max: () => {
      zoom();
    },
  };

  return (
    <motion.div
      ref={outer}
      onPointerDown={(e) => {
        focus(win.id);
        const t = e.target as HTMLElement;
        if (e.button === 0 && !win.max && t.closest("[data-drag]") && !t.closest("button,a,input,textarea,select,label,[role=switch],[role=button],[contenteditable],[data-no-drag]")) startMove(e);
      }}
      onDoubleClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("[data-drag]") && !t.closest("button,a,input")) zoom();
      }}
      className="absolute"
      style={{
        x,
        y,
        zIndex: win.z,
        pointerEvents: live ? "auto" : "none",
        visibility: hidden ? "hidden" : "visible",
        ...(win.max ? { left: 0, top: 0, width: "100%", height: `calc(100% - ${DOCK_SPACE}px)` } : { left: rect.left, top: rect.top, width: rect.w, height: rect.h }),
      }}
    >
      <motion.div className="h-full w-full" style={{ x: fx, y: fy, scaleX: fsx, scaleY: fsy, originX: 0, originY: 0 }}>
      {/* open from the dock icon, minimise into it (a quick genie-like squeeze) */}
      <motion.div
        initial={{ x: from.x, y: from.y, scaleX: 0.16, scaleY: 0.1, opacity: 0 }}
        animate={
          live
            ? { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, transition: M.ui }
            : { x: minTo.x, y: minTo.y, scaleX: 0.14, scaleY: 0.06, opacity: 0, transition: M.move }
        }
        exit={{ opacity: 0, scale: 0.97, transition: M.out }}
        onAnimationComplete={() => win.min && setHidden(true)}
        data-win={win.id}
        className={`win relative flex h-full w-full flex-col overflow-hidden ${focused ? "is-focused" : ""} ${win.max ? "is-max" : ""}`}
      >
        <div className="group/lights absolute left-[20px] top-[20px] z-[60] flex gap-[8px]" onPointerDown={(e) => e.stopPropagation()}>
          {LIGHTS.map((l) => (
            <button
              type="button"
              key={l.k}
              aria-label={l.k === "close" ? "Close" : l.k === "min" ? "Minimise" : "Zoom"}
              onClick={act[l.k]}
              className="flex h-3 w-3 items-center justify-center rounded-full ring-[0.5px] ring-inset ring-black/[0.12]"
              style={{ background: focused ? l.c : "#DCDCDF" }}
            >
              <svg viewBox="0 0 12 12" className="h-[8px] w-[8px] opacity-0 hov:group-hover/lights:opacity-100" aria-hidden="true"><path d={l.g} stroke="rgb(0 0 0 / 0.5)" strokeWidth="1.3" strokeLinecap="round" fill="none" /></svg>
            </button>
          ))}
        </div>
        <Chrome.Provider value={{ compact: false }}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AppView id={win.id} />
          </div>
        </Chrome.Provider>
      </motion.div>
      </motion.div>
      {!win.max && live && EDGES.map((ed) => <div key={ed} data-edge={ed} onPointerDown={startResize(ed)} className={`absolute z-30 touch-none ${EDGE_ZONE[ed]}`} style={{ cursor: EDGE_CURSOR[ed] }} />)}
    </motion.div>
  );
}

// ---------- dock ----------

const DOCK_ICON = 50;
const DOCK_MAX = 68;

function DockIcon({ id, mouseX, running, front = false, dark, dragging }: { id: AppId; mouseX: MotionValue<number>; running: boolean; front?: boolean; dark: boolean; dragging: boolean }) {
  const open = useOS((s) => s.open);
  const launch = useOS((s) => s.launch);
  const trashFull = useOS((s) => s.trash.length > 0);
  const ctx = useContextMenu();
  const ref = useRef<HTMLButtonElement>(null);
  const bounce = useAnimation();
  useEffect(() => {
    const el = ref.current;
    if (el) dockEls.set(id, el);
    return () => {
      dockEls.delete(id);
    };
  }, [id]);
  useEffect(() => {
    if (launch?.id === id && Date.now() - launch.t < 500)
      void bounce.start({ y: [0, -18, 0, -8, 0], transition: { duration: 0.7, times: [0, 0.3, 0.55, 0.75, 1], ease: "easeOut" } });
  }, [launch, id, bounce]);
  const dist = useTransform(mouseX, (v) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? v - (r.x + r.width / 2) : 999;
  });
  // the slot widens so neighbours make room; the artwork itself only scales (a transform), so the
  // icon's shadow and mask are never re-rastered at a new size mid-motion
  const target = useTransform(dist, [-140, 0, 140], [DOCK_ICON, DOCK_MAX, DOCK_ICON], { clamp: true });
  const size = useSpring(target, { mass: 0.1, stiffness: 220, damping: 18 });
  const scale = useTransform(size, (v) => v / DOCK_ICON);
  const [tip, setTip] = useState(false);
  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {tip && !dragging && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            data-glass=""
            className={`${glass("pop")} pointer-events-none absolute -top-[46px] whitespace-nowrap rounded-[8px] px-2.5 py-[3px] text-[13px] tracking-[-0.003em] text-ink`}
          >
            {apps[id].title}
          </motion.span>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        ref={ref}
        aria-label={`Open ${apps[id].title}`}
        style={{ width: size, height: DOCK_ICON }}
        onMouseEnter={() => setTip(true)}
        onMouseLeave={() => setTip(false)}
        onClick={() => {
          if (dragging) return;
          if (id === "launchpad") {
            const st = useOS.getState();
            return st.setOverlay(st.overlay === "apps" ? null : "apps");
          }
          useOS.getState().setOverlay(null);
          open(id);
        }}
        onContextMenu={(e) => {
          setTip(false);
          const s = useOS.getState();
          const items: MenuAction[] =
            id === "trash"
              ? [{ label: "Open", icon: AppWindow, run: () => open(id) }, "sep", { label: "Empty Trash", icon: Trash2, run: () => (s.emptyTrash()) }]
              : [
                  { label: running ? "Show" : "Open", icon: AppWindow, run: () => open(id) },
                  ...(running
                    ? ([
                        "sep",
                        { label: "Minimise", icon: Minus, run: () => (s.toggleMin(id)) },
                        { label: "Quit", icon: X, hint: "⌘Q", run: () => (s.close(id)) },
                      ] as MenuAction[])
                    : []),
                ];
          // a Dock menu stands on its icon, like the Dock's own
          ctx.open(e, items, e.currentTarget.getBoundingClientRect());
        }}
        data-trash={id === "trash" ? "" : undefined}
        className="dock-btn relative flex items-end justify-center"
      >
        <motion.div
          animate={bounce}
          whileTap={{ filter: "brightness(0.82)" }}
          style={{ scale, originY: 1, width: DOCK_ICON, height: DOCK_ICON }}
          className="shrink-0"
        >
          {id === "trash" ? <TrashArt size={DOCK_ICON} full={trashFull} /> : <AppIcon id={id} size={DOCK_ICON} />}
        </motion.div>
      </motion.button>
      {ctx.node}
      {/* the running mark is a drop: it swells in when the app opens and stretches into a short bar under the app in front */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: running ? 1 : 0, scaleX: running ? (front ? 3 : 1) : 0.3, scaleY: running ? 1 : 0.3 }}
        transition={M.glass}
        className={`mt-[3px] h-1 w-1 rounded-full ${dark ? "bg-white/85" : "bg-ink/75"}`}
      />
    </div>
  );
}

function Dock() {
  const windows = useOS((s) => s.windows);
  const mouseX = useMotionValue(Infinity);
  const running = new Set(windows.map((w) => w.id));
  const fine = useFinePointer();
  const dark = useWallpaper().dark;
  // the apps can be dragged into a new order, like the real dock
  const [order, setOrder] = useState<AppId[]>(dockApps);
  const [dragging, setDragging] = useState(false);
  const front = focusedApp(windows);
  return (
    <motion.div
      initial={{ y: 90 }}
      animate={{ y: 0 }}
      transition={{ ...M.arrive, delay: 0.2 }}
      className="absolute bottom-[6px] left-1/2 z-[1900] -translate-x-1/2"
    >
      <div
        onMouseMove={(e) => fine && !dragging && mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="relative flex h-[66px] items-end gap-1 px-[7px] pb-[2px]"
      >
        {/* material on its own layer, so the tooltips above can blur the wallpaper too */}
        <div aria-hidden data-glass="" className={`${glass("dock")} pointer-events-none absolute inset-0 rounded-[24px]`} />
        <div className="relative">
          <DockIcon id="launchpad" mouseX={mouseX} running={false} dark={dark} dragging={false} />
        </div>
        <Reorder.Group as="div" axis="x" values={order} onReorder={setOrder} className="relative flex items-end gap-1">
          {order.map((id) => (
            <Reorder.Item
              as="div"
              key={id}
              value={id}
              onDragStart={() => {
                setDragging(true);
                mouseX.set(Infinity);
              }}
              onDragEnd={() => window.setTimeout(() => setDragging(false), 0)}
              dragElastic={0.1}
              whileDrag={{ zIndex: 2 }}
              className="relative"
            >
              <DockIcon id={id} mouseX={mouseX} running={running.has(id)} front={front === id} dark={dark} dragging={dragging} />
            </Reorder.Item>
          ))}
        </Reorder.Group>
        <div className="relative mx-1 mb-[12px] h-[40px] w-px self-end bg-black/[0.14]" />
        {deskSharedApps.map((id) => (
          <div key={id} className="relative">
            <DockIcon id={id} mouseX={mouseX} running={running.has(id)} front={front === id} dark={dark} dragging={false} />
          </div>
        ))}
        <div className="relative mx-1 mb-[12px] h-[40px] w-px self-end bg-black/[0.14]" />
        <div className="relative">
          <DockIcon id="trash" mouseX={mouseX} running={running.has("trash")} dark={dark} dragging={false} />
        </div>
      </div>
    </motion.div>
  );
}

function useFinePointer() {
  const [fine, setFine] = useState(true);
  useEffect(() => setFine(window.matchMedia("(hover: hover) and (pointer: fine)").matches), []);
  return fine;
}

// ---------- Spotlight (no open animation: it's keyboard driven) ----------

function Spotlight() {
  const { palette, setPalette, open } = useOS();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const items = useMemo(() => {
    // apps first, then everything in the folders (projects, games, documents), under the folder's name
    const seen = new Set<AppId>(allApps);
    const list: { label: string; hint: string; icon?: AppId; run: () => void }[] = [
      ...allApps.map((id) => ({ label: apps[id].title, hint: id === "projects" || id === "games" ? "Folder" : "Application", icon: id, run: () => open(id) })),
      ...places.flatMap((pl) =>
        pl.groups.flatMap((g) =>
          g.items
            .filter((it) => it.app && !seen.has(it.app))
            .map((it) => ({ label: it.name, hint: `${pl.title} · ${it.kind}`, icon: it.app, run: () => open(it.app!) })),
        ),
      ),
      { label: "View as List", hint: "Page", run: () => (window.location.href = "/work") },
    ];
    return list.filter((i) => i.label.toLowerCase().includes(q.toLowerCase().trim()));
  }, [q, open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isUp(useOS.getState())) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(!useOS.getState().palette);
      }
      if (e.key === "Escape") setPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  useEffect(() => {
    setQ("");
    setSel(0);
  }, [palette]);

  if (!palette) return null;
  return (
    <div className="absolute inset-0 z-[2500] flex justify-center pt-[22vh]" onPointerDown={() => setPalette(false)}>
      <div onPointerDown={(e) => e.stopPropagation()} data-glass="" className={`${glass("pop")} sq-panel h-fit w-[min(680px,92vw)] overflow-hidden rounded-[20px]`}>
        <div className="flex h-[54px] items-center gap-2.5 px-4">
          <Sym icon={Search} size={20} className="shrink-0 text-ink-2" weight="medium" />
          <input
            id="spotlight-input"
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, items.length - 1));
              if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
              if (e.key === "Enter" && items[sel]) {
                items[sel].run();
                setPalette(false);
              }
            }}
            placeholder="Spotlight Search"
            className="min-w-0 flex-1 bg-transparent text-[22px] font-light tracking-[-0.02em] text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <ul className="max-h-[340px] overflow-auto border-t border-black/[0.08] p-[5px]">
          {items.map((it, i) => (
            <li key={it.label}>
              <button
                type="button"
                onMouseMove={() => setSel(i)}
                onClick={() => {
                  it.run();
                  setPalette(false);
                }}
                className={`flex h-[34px] w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] tracking-[-0.003em] ${sel === i ? "bg-[#0A84FF] text-white" : "text-ink"}`}
              >
                {it.icon ? <AppIcon id={it.icon} size={22} flat /> : <span className="h-[22px] w-[22px]" />}
                <span className="flex-1 truncate">{it.label}</span>
                <span className={`text-[12px] ${sel === i ? "text-white/75" : "text-ink-3"}`}>{it.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-[9px] py-2.5 text-[13px] text-ink-3">No results for “{q.trim()}”</li>}
        </ul>
      </div>
    </div>
  );
}

// ---------- desktop icons: a right-hand column like files on a Mac desktop ----------

const CELL_W = 108;
// tall enough for the artwork and a two-line name, with air before the next icon
const CELL_H = 116;
const EDGE = 10;
type Cell = { c: number; r: number };
const cellKey = (p: Cell) => `${p.c}:${p.r}`;



function DesktopIcons({ area }: { area: RefObject<HTMLDivElement | null> }) {
  const trash = useOS((s) => s.trash);
  const deleted = useOS((s) => s.deleted);
  const files = useOS((s) => s.files);
  const items: DeskItem[] = [
    ...desktopItems,
    ...files.map((f) => ({ id: f.id, name: f.name, kind: "image" as const, open: { look: "image" as const, src: f.src } })),
  ].filter((it) => !trash.includes(it.id) && !deleted.includes(it.id));
  const open = useOS((s) => s.open);
  const dark = useWallpaper().dark;
  const [pos, setPos] = useState<Record<string, Cell>>(() => Object.fromEntries(items.map((it, i) => [it.id, { c: 0, r: i }])));
  // a file dropped from an app lands in the grid cell under the pointer (or the nearest free one)
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(FILE_MIME);
    if (!raw) return;
    e.preventDefault();
    let f: { name: string; src: string };
    try {
      f = JSON.parse(raw);
    } catch {
      return;
    }
    const box = layer.current!.getBoundingClientRect();
    const c = Math.max(0, Math.floor((box.width - EDGE - (e.clientX - box.left)) / CELL_W));
    const r = Math.max(0, Math.floor((e.clientY - box.top - EDGE) / CELL_H));
    const id = useOS.getState().addFile(f);
    setPos((p) => {
      const taken = new Set(Object.values(p).map(cellKey));
      let cell = { c, r };
      for (let i = 0; taken.has(cellKey(cell)) && i < 200; i++) cell = { c: cell.c, r: cell.r + 1 };
      return { ...p, [id]: cell };
    });
    setSel([id]);
  };
  const [sel, setSel] = useState<string[]>([]);
  const [look, setLook] = useState<LookItem | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const band = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const width = () => layer.current?.clientWidth ?? window.innerWidth;
  // where a cell is, for hit tests. The icons themselves are placed from the right edge in CSS, so they stay on
  // the desktop's right-hand side whatever the window does.
  const at = (p: Cell) => ({ left: width() - EDGE - (p.c + 1) * CELL_W, top: EDGE + p.r * CELL_H });
  useOutside(menu !== null, () => setMenu(null));
  // Keep every icon on the desktop: when it gets shorter or narrower, an icon whose row or column no longer fits
  // moves to the nearest free cell (down the column, then the next column in), like Clean Up would put it.
  useLayoutEffect(() => {
    const fit = () => {
      const W = width();
      const H = (area.current?.clientHeight ?? window.innerHeight - 24) - DOCK_SPACE;
      const maxC = Math.max(0, Math.floor((W - EDGE * 2) / CELL_W) - 1);
      const maxR = Math.max(0, Math.floor((H - EDGE) / CELL_H) - 1);
      setPos((p) => {
        const ids = Object.keys(p);
        if (ids.every((id) => p[id].r <= maxR && p[id].c <= maxC)) return p;
        const next: Record<string, Cell> = {};
        const taken = new Set<string>();
        for (const id of ids) {
          if (p[id].r <= maxR && p[id].c <= maxC) {
            next[id] = p[id];
            taken.add(cellKey(p[id]));
          }
        }
        for (const id of ids) {
          if (next[id]) continue;
          let cell = { c: Math.min(p[id].c, maxC), r: Math.min(p[id].r, maxR) };
          for (let i = 0; taken.has(cellKey(cell)) && i < 400; i++) cell = cell.r < maxR ? { c: cell.c, r: cell.r + 1 } : { c: cell.c < maxC ? cell.c + 1 : 0, r: 0 };
          taken.add(cellKey(cell));
          next[id] = cell;
        }
        return next;
      });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const run = (it: DeskItem) => {
    if ("app" in it.open) open(it.open.app);
    else if ("url" in it.open) useOS.getState().openUrl(it.open.url);
    else if (it.open.look === "resume") setLook({ title: it.name, node: <Resume /> });
    else setLook({ title: it.name, src: it.open.src });
  };

  // rubber-band selection on empty desktop
  const onLayerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    setMenu(null);
    const keep = e.shiftKey || e.metaKey ? sel : [];
    setSel(keep);
    const box = layer.current!.getBoundingClientRect();
    const sx = e.clientX - box.left;
    const sy = e.clientY - box.top;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rects = items.map((it) => ({ id: it.id, ...at(pos[it.id] ?? { c: 1, r: 0 }) }));
    let raf = 0;
    let last = keep.join();
    let cur = { x: sx, y: sy };
    const paint = () => {
      raf = 0;
      const b = band.current;
      if (!b) return;
      const l = Math.min(sx, cur.x);
      const t = Math.min(sy, cur.y);
      const w = Math.abs(cur.x - sx);
      const h = Math.abs(cur.y - sy);
      b.style.display = "block";
      b.style.transform = `translate(${l}px, ${t}px)`;
      b.style.width = `${w}px`;
      b.style.height = `${h}px`;
      // an icon is in when the band touches its artwork or its label
      const hit = rects.filter((r) => r.left + 14 < l + w && r.left + CELL_W - 14 > l && r.top < t + h && r.top + CELL_H - 8 > t).map((r) => r.id);
      const next = [...new Set([...keep, ...hit])];
      if (next.join() !== last) {
        last = next.join();
        setSel(next);
      }
    };
    const move = (ev: PointerEvent) => {
      cur = { x: ev.clientX - box.left, y: ev.clientY - box.top };
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      cancelAnimationFrame(raf);
      if (band.current) band.current.style.display = "none";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  // drag the selection as one group; it snaps to the grid where it lands
  const onIconDown = (it: DeskItem) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null);
    let group = sel;
    if (e.shiftKey || e.metaKey) {
      group = sel.includes(it.id) ? sel.filter((x) => x !== it.id) : [...sel, it.id];
      setSel(group);
      return;
    }
    if (!sel.includes(it.id)) {
      group = [it.id];
      setSel(group);
    }
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let overTrash = false;
    const trashEl = dockEls.get("trash");
    const move = (ev: PointerEvent) => {
      const ox = ev.clientX - sx;
      const oy = ev.clientY - sy;
      if (!moved && Math.hypot(ox, oy) < 4) return;
      moved = true;
      dx.set(ox);
      dy.set(oy);
      // over the Trash: it lifts to take the drop
      const r = trashEl?.getBoundingClientRect();
      const hot = !!r && ev.clientX > r.left - 6 && ev.clientX < r.right + 6 && ev.clientY > r.top - 10 && ev.clientY < r.bottom + 8;
      if (hot !== overTrash) {
        overTrash = hot;
        trashEl?.toggleAttribute("data-hot", hot);
      }
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (!moved) return;
      if (overTrash) {
        trashEl?.removeAttribute("data-hot");
        useOS.getState().trashed(group);
        useOS.setState({ launch: { id: "trash", t: Date.now() } });
        setSel([]);
        dx.set(0);
        dy.set(0);
        return;
      }
      const W = width();
      const H = (area.current?.clientHeight ?? window.innerHeight) - DOCK_SPACE;
      const maxC = Math.max(0, Math.floor((W - EDGE * 2) / CELL_W) - 1);
      const maxR = Math.max(0, Math.floor((H - EDGE) / CELL_H) - 1);
      const ox = dx.get();
      const oy = dy.get();
      setPos((p) => {
        const next = { ...p };
        const taken = new Set(items.filter((x) => !group.includes(x.id)).map((x) => cellKey(p[x.id] ?? { c: 1, r: 0 })));
        for (const id of group) {
          const c = Math.min(maxC, Math.max(0, Math.round(p[id].c - ox / CELL_W)));
          const r = Math.min(maxR, Math.max(0, Math.round(p[id].r + oy / CELL_H)));
          let cell = { c, r };
          // a taken cell pushes the icon to the nearest free one below, then to the next column
          for (let i = 0; taken.has(cellKey(cell)) && i < 200; i++) cell = cell.r < maxR ? { c: cell.c, r: cell.r + 1 } : { c: Math.min(maxC, cell.c + 1), r: 0 };
          taken.add(cellKey(cell));
          next[id] = cell;
        }
        return next;
      });
      dx.set(0);
      dy.set(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const menuItem = menu && items.find((x) => x.id === menu.id);
  return (
    <div
      ref={layer}
      data-desk=""
      onPointerDown={onLayerDown}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(FILE_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
      className="absolute inset-0"
    >
      {items.map((it) => {
        const on = sel.includes(it.id);
        const cell = pos[it.id] ?? { c: 1, r: 0 };
        return (
          <motion.button
            type="button"
            key={it.id}
            // named by its visible label (an aria-label here also took in the lettering drawn on its icon)
            onPointerDown={onIconDown(it)}
            onDoubleClick={() => run(it)}
            onKeyDown={(e) => e.key === "Enter" && run(it)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!on) setSel([it.id]);
              const b = layer.current!.getBoundingClientRect();
              // kept on the screen: a menu opened beside the right edge or over the Dock opens back from it
              setMenu({ x: Math.min(e.clientX - b.left, b.width - 208), y: Math.min(e.clientY - b.top, b.height - 190), id: it.id });
            }}
            style={{ right: EDGE + cell.c * CELL_W, top: EDGE + cell.r * CELL_H, x: on ? dx : 0, y: on ? dy : 0 }}
            className="absolute flex w-[108px] flex-col items-center gap-[3px] pt-1 outline-none"
          >
            <span className={`flex h-[72px] w-[72px] items-center justify-center rounded-[8px] ${on ? "bg-black/[0.22] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]" : ""}`}>
              <DeskArt item={it} />
            </span>
            <span
              className={`line-clamp-2 max-w-[104px] rounded-[6px] px-[5px] py-px text-center text-[12px] font-medium leading-[15px] [text-wrap:balance] ${
                on ? "bg-[#0A84FF] text-white" : dark ? "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.85),0_0_7px_rgb(0_0_0/0.5)]" : "text-[#1a1b1e] [text-shadow:0_0_3px_rgb(255_255_255/0.95)] dark:text-white dark:[text-shadow:0_1px_2px_rgb(0_0_0/0.85),0_0_7px_rgb(0_0_0/0.5)]"
              }`}
            >
              {it.name}
            </span>
          </motion.button>
        );
      })}
      <div ref={band} aria-hidden className="pointer-events-none absolute left-0 top-0 hidden rounded-[2px] border border-[#0A84FF]/80 bg-[#0A84FF]/[0.14]" />
      <AnimatePresence>
        {menu && menuItem && (
          <motion.div
            key="ctx"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: M.out }}
            onPointerDown={(e) => e.stopPropagation()}
            data-glass=""
            style={{ left: menu.x, top: menu.y }}
            className={`${glass("pop")} absolute z-[3000] w-[200px] rounded-[8px] p-[5px]`}
          >
            <MenuItem
              icon={msym(AppWindow)}
              onClick={() => {
                setMenu(null);
                run(menuItem);
              }}
            >
              Open
            </MenuItem>
            {!("app" in menuItem.open) && (
              <MenuItem
                icon={msym(Eye)}
                hint="Space"
                onClick={() => {
                  setMenu(null);
                  run(menuItem);
                }}
              >
                Quick Look
              </MenuItem>
            )}
            <Sep />
            <MenuItem
              icon={msym(LayoutGrid)}
              onClick={() => {
                setMenu(null);
                setPos(Object.fromEntries(items.map((x, i) => [x.id, { c: 0, r: i }])));
              }}
            >
              Clean Up
            </MenuItem>
          </motion.div>
        )}
      </AnimatePresence>
      <QuickLook items={look ? [look] : []} index={look ? 0 : null} onClose={() => setLook(null)} />
      <SpaceLook sel={sel} items={items} run={run} active={!look} />
    </div>
  );
}

// Space opens Quick Look on the selected file, like Finder.
function SpaceLook({ sel, items, run, active }: { sel: string[]; items: DeskItem[]; run: (it: DeskItem) => void; active: boolean }) {
  useEffect(() => {
    if (!active || sel.length !== 1) return;
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (e.key !== " " || t === "INPUT" || t === "TEXTAREA" || !isUp(useOS.getState())) return;
      const it = items.find((x) => x.id === sel[0]);
      if (it && !("app" in it.open)) {
        e.preventDefault();
        run(it);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, items, run, active]);
  return null;
}

// A note on the desktop, like a widget: who this is and where to start. It sits left of the Music window the
// desktop opens with, and can be closed for the visit.
const NOTE_W = 300;
function Welcome() {
  const open = useOS((s) => s.open);
  const dark = useWallpaper().dark;
  const [gone, setGone] = useState(false);
  return (
    // z-[1]: over the desktop icons' full-screen selection layer (which took its clicks), under every window
    <div className="pointer-events-none absolute left-6 top-6 z-[1] flex flex-col gap-2.5" style={{ width: NOTE_W }}>
    <AnimatePresence>
      {!gone && (
        <motion.aside
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, transition: M.out }}
          transition={{ ...M.arrive, delay: 0.35 }}
          aria-label="Welcome note"
          data-glass=""
          style={{ width: NOTE_W }}
          className={`${glass(dark ? "widget-dark" : "widget")} sq-panel group pointer-events-auto relative rounded-[26px] p-5 ${dark ? "text-white" : "text-ink"}`}
        >
          <button
            type="button"
            aria-label="Close note"
            onClick={() => setGone(true)}
            className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black/10 opacity-0 transition-opacity duration-150 focus-visible:opacity-100 hov:group-hover:opacity-100"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <Monogram size={44} />
          <h2 className="t-title3 mt-3">Hi, I&apos;m {owner.name}.</h2>
          <p className={`t-sub mt-1 ${dark ? "text-white/75" : "text-ink-2"}`}>
            {owner.role} from {owner.city}.
          </p>
          <p className={`t-sub mt-3 [text-wrap:pretty] ${dark ? "text-white/75" : "text-ink-2"}`}>
            This is my portfolio, built as a small operating system. My work is in Projects, my music in Records.
          </p>
          <div className="mt-4 flex gap-2">
            <Btn variant="prominent" capsule onClick={() => open("projects")}>
              Open Projects
            </Btn>
            {/* no glass on glass: the second action is a plain tint */}
            <Btn variant="plain" capsule onClick={() => open("contact")} className={dark ? "!bg-white/15 !text-white" : "!bg-black/[0.06]"}>
              Get in Touch
            </Btn>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
    <DeskWidgets dark={dark} />
    </div>
  );
}

// Desktop widgets under the note, macOS style: what he is working on now, one featured project, and a few photos.
// They only show where the screen is tall enough to hold them under the note.
function DeskWidgets({ dark }: { dark: boolean }) {
  const open = useOS((s) => s.open);
  const best = useMemo(() => {
    const ids = gallery.albums.find((a) => a.id === "best")?.items ?? [];
    return ids.map((id) => gallery.media.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m && m.kind === "photo");
  }, []);
  const [i, setI] = useState(0);
  useLiveInterval(() => setI((n) => (n + 1) % best.length), best.length < 2 || reducedMotion() ? null : 7000);
  const featured = projects.contles;
  const shell = `${glass(dark ? "widget-dark" : "widget")} sq-panel press pointer-events-auto relative overflow-hidden rounded-[22px] text-left`;
  const sub = dark ? "text-white/65" : "text-ink-2";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...M.arrive, delay: 0.5 }} className="hidden flex-col gap-2.5 [@media(min-height:820px)]:flex">
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" data-glass="" onClick={() => open("larpo")} className={`${shell} flex aspect-square flex-col justify-between p-4 ${dark ? "text-white" : "text-ink"}`}>
          <AppIcon id="larpo" size={40} />
          <span>
            <span className={`block text-[11px] font-semibold uppercase tracking-[0.04em] ${dark ? "text-white/55" : "text-ink-3"}`}>Working on</span>
            <span className="t-headline block">{mainWork.name}</span>
            <span className={`block text-[12px] leading-4 ${sub}`}>A team of three</span>
          </span>
        </button>
        <button type="button" onClick={() => open("gallery")} aria-label="Open Gallery" className="sq-panel press pointer-events-auto relative aspect-square overflow-hidden rounded-[22px] bg-black shadow-[0_10px_30px_-12px_rgb(0_0_0/0.5)]">
          <AnimatePresence initial={false}>
            {best[i] && (
              <motion.img key={best[i].id} src={best[i].thumb} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }} className="absolute inset-0 h-full w-full object-cover" />
            )}
          </AnimatePresence>
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3.5 pb-3 pt-8 text-left text-[13px] font-semibold text-white">Gallery</span>
        </button>
      </div>
      {featured && (
        <button type="button" onClick={() => open("contles")} className="sq-panel press pointer-events-auto relative h-[148px] overflow-hidden rounded-[22px] bg-black text-left shadow-[0_10px_30px_-12px_rgb(0_0_0/0.5)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={featured.image} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-4 text-white">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-white/65">Featured</span>
            <span className="t-headline block">{featured.name}</span>
            <span className="block text-[12px] leading-4 text-white/75">From an idea to Lithuania&apos;s biggest stages</span>
          </span>
        </button>
      )}
    </motion.div>
  );
}

// `user` is still passed by the intro (Experience.tsx); there is one desktop, so it is not read.
export default function Desktop(_: { user?: UserId }) {
  useGlassScope();
  const windows = useOS((s) => s.windows);
  const topZ = useOS((s) => s.topZ);
  const overlay = useOS((s) => s.overlay);
  const area = useRef<HTMLDivElement>(null);
  const wp = useWallpaper();

  useEffect(warmApps, []);
  // ⌘W closes, ⌘M minimises the focused window (where the browser lets the page have the key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useOS.getState();
      // the session is still here under the lock screen, but it does not hear the keyboard
      if (!isUp(st)) return;
      if (e.key === "F3" || (e.ctrlKey && e.key === "ArrowUp")) {
        e.preventDefault();
        return st.setOverlay(st.overlay === "mission" ? null : "mission");
      }
      if (e.key === "F4") {
        e.preventDefault();
        return st.setOverlay(st.overlay === "apps" ? null : "apps");
      }
      if (e.key === "Escape" && st.overlay) return st.setOverlay(null);
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (e.metaKey && e.ctrlKey && k === "q") {
        e.preventDefault();
        useOS.getState().lockScreen();
        return;
      }
      const { windows, close, toggleMin } = useOS.getState();
      const f = focusedApp(windows);
      if (!f) return;
      if (k === "w") {
        e.preventDefault();
        close(f);
      } else if (k === "m") {
        e.preventDefault();
        toggleMin(f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="wp-photo absolute inset-0 select-none overflow-hidden" style={wp.src.startsWith("live:") ? undefined : { backgroundImage: `url(${wp.src})` }}>
      {wp.src.startsWith("live:") && <LiveWallpaper />}
      <MenuBar />
      {/* isolate: windows stack among themselves, always under the menu bar and the dock */}
      <div ref={area} id="os-window-layer" data-overlay={overlay ?? undefined} className="absolute inset-x-0 bottom-0 top-[24px] isolate">
        <Welcome />
        <DesktopIcons area={area} />
        <AnimatePresence>
          {windows.map((w, i) => (
            <Window key={w.id} win={w} index={i} area={area} focused={w.z === topZ && !w.min} />
          ))}
        </AnimatePresence>
      </div>
      <AppsOverlay />
      <MissionControl />
      <Dock />
      <Spotlight />
    </div>
  );
}
