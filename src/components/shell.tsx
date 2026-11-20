"use client";

// The pieces both shells (the Mac's desktop and the phone) and the apps share. They live apart from Desktop.tsx
// and Login.tsx so that a phone never downloads the Mac's desktop to draw three bars, and an app never pulls a
// whole shell in for a picture.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { owner, resume, type AppId, type DeskItem } from "@/content";
import { useOS } from "@/store";
import { AppIcon, DocArt, FolderArt } from "./icons";
import { SystemBootMark } from "./Mark";
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

// The Résumé: a real CV on a page, from content.ts (resume). A row that has a page in the OS opens it.
export function Resume() {
  const isMobile = useOS((s) => s.isMobile);
  const go = (id: AppId) => (isMobile ? useOS.getState().openPhoneApp(id) : useOS.getState().open(id));
  const head = "mt-7 border-b border-black/[0.08] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3";
  return (
    <div className="flex justify-center bg-[#E9EAED] p-6 max-[520px]:p-3">
      <article className="w-full max-w-[600px] bg-white px-12 py-11 text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)] max-[520px]:px-6 max-[520px]:py-7">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/augustas-96.webp" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <div className="min-w-0">
            <h2 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.022em]">{resume.name}</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              {resume.title}. {resume.city}.
            </p>
          </div>
        </div>
        <p className="mt-5 text-[13px] leading-[1.55] text-ink [text-wrap:pretty]">{resume.summary}</p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {resume.links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] hover:underline">
              {l.label}
            </a>
          ))}
        </p>
        {resume.sections.map((sec) => (
          <section key={sec.title}>
            <h3 className={head}>{sec.title}</h3>
            {sec.rows.map((r) => (
              <div key={r.org + r.title} className="mt-3.5 flex gap-4 text-[13px] leading-[1.45] max-[520px]:flex-col max-[520px]:gap-0.5">
                <span className="w-24 shrink-0 tabular-nums text-ink-3">{r.when}</span>
                <span className="min-w-0">
                  {r.app ? (
                    <button type="button" onClick={() => go(r.app!)} className="text-left font-semibold hover:text-[var(--accent-text)]">
                      {r.title}
                    </button>
                  ) : (
                    <span className="font-semibold">{r.title}</span>
                  )}
                  <span className="text-ink-2">, {r.org}</span>
                  <span className="mt-0.5 block text-ink-2 [text-wrap:pretty]">{r.body}</span>
                </span>
              </div>
            ))}
          </section>
        ))}
        <h3 className={head}>Skills</h3>
        <dl className="mt-1">
          {resume.skills.map((k) => (
            <div key={k.label} className="mt-2.5 flex gap-4 text-[13px] leading-[1.45] max-[520px]:flex-col max-[520px]:gap-0.5">
              <dt className="w-24 shrink-0 text-ink-3">{k.label}</dt>
              <dd className="min-w-0 text-ink">{k.value}</dd>
            </div>
          ))}
        </dl>
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
  if (item.kind === "doc") return <DocArt size={64} label={item.ext} />;
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

// His account picture, as macOS and iOS show one: his own photograph in a circle. The files are a square cut of
// public/img/augustas.jpg around his face (so the face sits in the middle of the circle at any size), at 96, 192
// and 288 px: the browser takes the one that is twice the drawn size (three times on a 3x phone), never the whole
// picture. Off-screen ones load lazily; the lock screen's, which is the first thing seen, loads at once (`eager`).
// A hairline in pure black or white keeps its edge on any ground.
const PHOTO = [96, 192, 288].map((w) => `/img/augustas-${w}.webp ${w}w`).join(", ");
export function Monogram({ size = 88, eager = false }: { size?: number; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/img/augustas-192.webp"
      srcSet={PHOTO}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={owner.name}
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : undefined}
      className="block shrink-0 rounded-full bg-[#101012] object-cover shadow-[0_10px_26px_-12px_rgb(16_18_24/0.5)] outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      style={{ width: size, height: size }}
    />
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
