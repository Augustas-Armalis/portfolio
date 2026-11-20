"use client";

// The pieces both shells (the Mac's desktop and the phone) and the apps share. They live apart from Desktop.tsx
// and Login.tsx so that a phone never downloads the Mac's desktop to draw three bars, and an app never pulls a
// whole shell in for a picture.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { about, mainWork, otherWork, owner, projectGroups, projects, type DeskItem } from "@/content";
import { useOS } from "@/store";
import { AppIcon, DocArt, FolderArt } from "./icons";
import { MarkDeep, SystemBootMark } from "./Mark";
import { EASE_OUT, sfx } from "./ui";

// Now-playing bars. A CSS animation on transform only: it runs on the compositor for as long as music plays,
// instead of a script laying three bars out again every frame.
export function Bars({ light = false }: { light?: boolean }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`eq-bar h-full w-[2px] rounded-full ${light ? "bg-white" : "bg-ink"}`} style={{ animationDelay: `${i * -0.37}s` }} />
      ))}
    </span>
  );
}

export function Resume() {
  const founder = projectGroups[1].apps.filter((a) => projects[a]);
  return (
    <div className="flex justify-center bg-[#E9EAED] p-6 max-[520px]:p-3">
      <article className="w-full max-w-[560px] bg-white px-12 py-11 text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)] max-[520px]:px-6 max-[520px]:py-7">
        <h2 className="text-[26px] font-semibold tracking-[-0.022em]">{about.name}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          {owner.role}. {owner.city}.
        </p>
        <h2 className="mt-8 border-b border-black/[0.08] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Work</h2>
        {[mainWork, ...otherWork].map((p) => (
          <div key={p.id} className="mt-3 flex gap-4 text-[13px]">
            <span className="w-24 shrink-0 tabular-nums text-ink-3">{p.years}</span>
            <span>
              <span className="font-semibold">{p.name}</span>
              {p.role && <span className="text-ink-2">, {p.role.toLowerCase()}</span>}
              {p.what && <span className="block text-ink-2">{p.what}</span>}
            </span>
          </div>
        ))}
        <h2 className="mt-7 border-b border-black/[0.08] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Founder</h2>
        {founder.map((a) => {
          const p = projects[a]!;
          return (
            <div key={a} className="mt-3 flex gap-4 text-[13px]">
              <span className="w-24 shrink-0 tabular-nums text-ink-3">{p.years ?? p.status}</span>
              <span>
                <span className="font-semibold">{p.name}</span>
                {p.what && <span className="block text-ink-2">{p.what}</span>}
              </span>
            </div>
          );
        })}
        <h2 className="mt-7 border-b border-black/[0.08] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Elsewhere</h2>
        <p className="mt-3 text-[13px] text-ink-2">
          {owner.studio.label}, {owner.x.label} on X
        </p>
      </article>
    </div>
  );
}

export function DeskArt({ item }: { item: DeskItem }) {
  if (item.art)
    return (
      <span className="flex h-16 w-16 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.art} alt="" draggable={false} decoding="async" className="h-[58px] w-[58px] rounded-[8px] bg-white object-contain p-[3px] shadow-[0_1px_3px_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.1)]" />
      </span>
    );
  if (item.kind === "folder") return <FolderArt size={64} glyph={item.id === "projects" || item.id === "games" || item.id === "documents" ? item.id : undefined} />;
  if (item.kind === "doc") return <DocArt size={64} />;
  if (item.kind === "image" && "src" in item.open)
    return (
      <span className="flex h-16 w-16 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.thumb ?? item.open.src} alt="" draggable={false} decoding="async" className="max-h-[60px] max-w-[52px] border-[2px] border-white shadow-[0_1px_3px_rgb(0_0_0/0.35)]" />
      </span>
    );
  return "app" in item.open ? (
    <span className="flex h-16 w-16 items-center justify-center">
      <AppIcon id={item.open.app} size={56} />
    </span>
  ) : null;
}

// His mark as an account picture: the gold circle on a near-black disc, the app icon made round
// (to be swapped for his photo later).
export function Monogram({ size = 88 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#1b1c21_0%,#0a0b0d_100%)] shadow-[0_10px_26px_-12px_rgb(16_18_24/0.5),inset_0_0_0_0.5px_rgb(255_255_255/0.14),0_0_0_0.5px_rgb(0_0_0/0.3)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label={owner.name}
    >
      <MarkDeep size={Math.round(size * 0.56)} />
    </div>
  );
}

// The boot frame, like a Mac starting up: pure black, the logo dead centre, and 60pt under it a thin bar.
// These numbers are the whole layout; the 3D display's boot frame is meant to be drawn from the same ones.
export const BOOT_UI = { logo: 84, gap: 60, barW: 200, barH: 3 };

// The logo and the bar on black. `at` is when the boot began (ms): every part is placed on that clock with a
// negative animation delay, so if this is mounted again part-way through (the desktop hands over to the lock
// screen underneath a restart) it carries on from the same frame instead of starting over.
export function BootScreen({ at }: { at: number }) {
  const [t0] = useState(() => Math.max(0, (Date.now() - at) / 1000));
  const { logo, gap, barW, barH } = BOOT_UI;
  return (
    <div className="absolute inset-0 text-white" aria-hidden>
      <div className="boot-in absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ height: logo, animationDelay: `${0.5 - t0}s` }}>
        <SystemBootMark size={logo} />
      </div>
      <div
        className="boot-in absolute left-1/2 top-1/2 overflow-hidden rounded-full bg-white/[0.22]"
        style={{ width: barW, height: barH, marginLeft: -barW / 2, marginTop: logo / 2 + gap, animationDelay: `${0.9 - t0}s` }}
      >
        <div className="boot-fill h-full w-full rounded-full bg-white" style={{ animationDelay: `${1.0 - t0}s` }} />
      </div>
    </div>
  );
}

// Sleep (black until a click) and Restart (the boot frame, then the lock screen).
// It is drawn on <body>, outside whichever screen asked for it: the desktop and the lock screen each render one,
// and the screen under it is swapped (and cross-faded) while it is up, which must not show through or restart it.
export function PowerOverlay() {
  const sleeping = useOS((s) => s.sleeping);
  const restarting = useOS((s) => s.restarting);
  const restartAt = useOS((s) => s.restartAt);
  const sleep = useOS((s) => s.sleep);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  // the chime lands as the logo appears, once per restart however many screens mount under it
  useEffect(() => {
    if (!restarting) return;
    const wait = restartAt + 500 - Date.now();
    if (wait < 0) return;
    const t = window.setTimeout(() => sfx("boot"), wait);
    return () => window.clearTimeout(t);
  }, [restarting, restartAt]);
  // already black when this copy mounts under a restart in progress: no second fade
  const [late] = useState(() => restarting && Date.now() - restartAt > 200);
  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {(sleeping || restarting) && (
        <motion.div
          key={sleeping ? "sleep" : "restart"}
          initial={late ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
          transition={{ duration: sleeping ? 0.6 : 0.25, ease: EASE_OUT }}
          onClick={() => sleeping && sleep(false)}
          role={sleeping ? "button" : undefined}
          aria-label={sleeping ? "Wake" : undefined}
          className="fixed inset-0 z-[6000] bg-black"
        >
          {restarting && <BootScreen at={restartAt} />}
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  );
}
