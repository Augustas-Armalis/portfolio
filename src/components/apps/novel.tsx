"use client";

// Novel: a Books-style library and reader.

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { novel } from "@/content";
import { Btn, glass, SplitFrame, Toolbar, useChrome } from "../ui";
import { Empty } from "./shared";

type Chapter = { id: string; title: string; paragraphs: string[]; words: number; image?: string };

export type Book = { title: string; author: string; illustrator: string; years: string; blurb: string; cover: string; chapters: Chapter[] };

let bookLoad: Promise<Book> | null = null;

const loadBook = () => (bookLoad ??= fetch(novel.src).then((r) => (r.ok ? r.json() : Promise.reject(new Error("novel")))));

const POS_KEY = "augustas-os:novel";

type Pos = { ch: number; at: number };

function readPos(): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return v && typeof v.ch === "number" ? v : null;
  } catch {
    return null;
  }
}

function writePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {}
}

// a serif reading face with Lithuanian glyphs, loaded only when the book opens
function useReadingFont() {
  useEffect(() => {
    if (document.getElementById("font-literata")) return;
    const l = document.createElement("link");
    l.id = "font-literata";
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&display=swap";
    document.head.appendChild(l);
  }, []);
}

const minutes = (w: number) => `${Math.max(1, Math.round(w / 230))} min`;

const SERIF = "font-[Literata,Georgia,serif]";

export function Novel() {
  // in a narrow window the contents list is tucked away behind the toolbar's sidebar button
  const [side, setSide] = useState(false);
  const { compact } = useChrome();
  useReadingFont();
  const [book, setBook] = useState<Book | null>(null);
  const [failed, setFailed] = useState(false);
  const [ch, setCh] = useState<number | null>(null);
  const [saved, setSaved] = useState<Pos | null>(null);
  useEffect(() => {
    let live = true;
    loadBook()
      .then((b) => live && setBook(b))
      .catch(() => live && setFailed(true));
    setSaved(readPos());
    return () => {
      live = false;
    };
  }, []);
  const save = (p: Pos) => {
    writePos(p);
    setSaved(p);
  };
  if (failed) return <Empty icon={<BookOpen size={22} strokeWidth={1.5} />} title="The book couldn't load" body="Check the connection and open Novel again." />;
  const total = book?.chapters.reduce((a, c) => a + c.words, 0) ?? 0;
  const doneWords = book && saved ? book.chapters.slice(0, saved.ch).reduce((a, c) => a + c.words, 0) + (book.chapters[saved.ch]?.words ?? 0) * saved.at : 0;
  const pct = total ? Math.round((doneWords / total) * 100) : 0;

  const library = (
    <div className={`mx-auto max-w-[620px] ${compact ? "px-4 pb-10" : "px-8 py-8"}`}>
      <div className={`flex gap-7 ${compact ? "flex-col items-center text-center" : "items-start @max-[459px]:flex-col @max-[459px]:items-center @max-[459px]:text-center"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={novel.cover} alt={novel.title} draggable={false} data-sq="" className="book-cover aspect-[2/3] w-[168px] shrink-0 rounded-[12px] bg-[#0b0d12] object-cover" />
        <div className={`min-w-0 ${compact ? "" : "pt-1"}`}>
          <h2 className={`${SERIF} text-[28px] font-semibold leading-[1.12] tracking-[-0.015em] text-ink [text-wrap:balance]`}>{novel.title}</h2>
          <p className="t-sub mt-2 text-ink-2">{novel.author}</p>
          <p className="t-foot text-ink-3">Iliustracijos: {novel.illustrator}</p>
          <div className={`mt-4 flex items-center gap-3 ${compact ? "justify-center" : "@max-[459px]:justify-center"}`}>
            <Btn variant="prominent" capsule size="md" onClick={() => book && setCh(saved?.ch ?? 0)} icon={<BookOpen size={14} />} className="!px-4">
              {saved ? "Continue" : "Read"}
            </Btn>
            {book && <span className="m-body tabular-nums text-ink-2">{saved ? `${pct}% read` : `${book.chapters.length} chapters, ${Math.round(total / 1000)}k words`}</span>}
          </div>
        </div>
      </div>
      {book ? (
        <p className={`mt-7 ${SERIF} text-[15px] leading-[1.6] text-ink-2 ${compact ? "text-left" : ""}`} lang="lt">
          {book.blurb}
        </p>
      ) : (
        <div className="mt-7 space-y-2.5" aria-hidden>
          {[100, 96, 98, 72].map((w, i) => (
            <div key={i} className="skeleton h-3 rounded-[6px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {compact && book && (
        <>
          <div className="mb-[7px] mt-8 px-4 text-left text-[13px] uppercase tracking-[-0.005em] text-[#6D6D72]">Contents</div>
          <div className="sq-list overflow-hidden rounded-[12px] bg-white text-left">
            {book.chapters.map((c, i) => (
              <button type="button" key={c.id} onClick={() => setCh(i)} className="press-row flex min-h-[44px] w-full items-center pl-4">
                <span className={`flex min-h-[44px] flex-1 items-center gap-2 pr-4 ${i ? "border-t-[0.5px] border-[#C6C6C8]" : ""}`}>
                  <span className="flex-1 text-[17px] tracking-[-0.02em] text-ink">{c.title}</span>
                  {saved?.ch === i && <span className="h-2 w-2 rounded-full bg-[#0A84FF]" />}
                  <span className="text-[15px] tabular-nums text-ink-3">{minutes(c.words)}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  if (compact) {
    return (
      <>
        {library}
        <AnimatePresence>
          {book && ch !== null && <PagedReader key="reader" book={book} ch={ch} setCh={setCh} start={saved?.ch === ch ? saved.at : 0} onPos={save} onClose={() => setCh(null)} />}
        </AnimatePresence>
      </>
    );
  }

  return (
    <SplitFrame shown={side} setShown={setSide} className="flex h-full min-h-0">
      <aside data-drag data-shown={side} onClick={() => setSide(false)} className="split-side flex w-[220px] shrink-0 flex-col overflow-auto border-r border-black/[0.06] bg-[#F4F4F6] px-2.5 pb-3 pt-[52px]">
        <button
          type="button"
          onClick={() => setCh(null)}
          className={`flex h-[28px] shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] text-ink ${ch === null ? "bg-black/[0.08]" : "hov:hover:bg-black/[0.035]"}`}
        >
          <BookOpen size={15} className="text-ink-2" /> Library
        </button>
        <div className="mt-3 flex h-[22px] shrink-0 items-center px-2 text-[11px] font-semibold text-ink-3">Contents</div>
        {book
          ? book.chapters.map((c, i) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setCh(i)}
                className={`flex h-[28px] shrink-0 items-center gap-2 rounded-[8px] px-2 text-left text-[13px] ${ch === i ? "bg-black/[0.08] text-ink" : "text-ink hov:hover:bg-black/[0.035]"}`}
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {saved?.ch === i && ch !== i && <span className="h-1.5 w-1.5 rounded-full bg-[#0A84FF]" />}
                <span className="text-[11px] tabular-nums text-ink-3">{minutes(c.words)}</span>
              </button>
            ))
          : Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton mx-2 my-[7px] h-3.5 shrink-0 rounded-[6px]" style={{ width: `${60 + ((i * 17) % 30)}%` }} />)}
      </aside>
      <div className="relative min-w-0 flex-1 bg-white">
        <AnimatePresence mode="wait" initial={false}>
          {book && ch !== null ? (
            <motion.div key={`ch-${ch}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <ScrollReader book={book} ch={ch} setCh={setCh} start={saved?.ch === ch ? saved.at : 0} onPos={save} />
            </motion.div>
          ) : (
            <motion.div key="lib" className="absolute inset-0 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              <Toolbar title="Library" sub={novel.years} />
              <div className="@container min-h-0 flex-1 overflow-auto">{library}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SplitFrame>
  );
}

function ChapterBody({ c }: { c: Chapter }) {
  return (
    <>
      {c.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.image} alt="" draggable={false} className="mx-auto mb-7 block w-[min(240px,60%)] mix-blend-multiply dark:mix-blend-screen dark:invert" />
      )}
      <h2 className={`mb-6 text-center ${SERIF} text-[24px] font-semibold tracking-[-0.01em] text-ink`}>{c.title}</h2>
      {c.paragraphs.map((p, i) => (
        <p key={i} lang="lt" className={`${SERIF} text-[17px] leading-[1.65] text-[#24262b] [hyphens:auto] ${i ? "indent-[1.5em]" : ""}`}>
          {p}
        </p>
      ))}
    </>
  );
}

function ScrollReader({ book, ch, setCh, start, onPos }: { book: Book; ch: number; setCh: (i: number) => void; start: number; onPos: (p: Pos) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const c = book.chapters[ch];
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = start * Math.max(0, el.scrollHeight - el.clientHeight);
    let t: number | undefined;
    const onScroll = () => {
      const at = el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 1;
      if (bar.current) bar.current.style.transform = `scaleX(${at})`;
      window.clearTimeout(t);
      t = window.setTimeout(() => onPos({ ch, at }), 250);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" && ch < book.chapters.length - 1) setCh(ch + 1);
      if (e.key === "ArrowLeft" && ch > 0) setCh(ch - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ch, book.chapters.length, setCh]);
  const last = book.chapters.length - 1;
  return (
    <div className="flex h-full flex-col">
      <Toolbar title={c.title} sub={`${ch + 1} of ${book.chapters.length}, ${minutes(c.words)}`}>
        <Btn variant="plain" size="sm" iconOnly label="Previous chapter" disabled={ch === 0} onClick={() => setCh(ch - 1)} icon={<ChevronLeft size={16} />} />
        <Btn variant="plain" size="sm" iconOnly label="Next chapter" disabled={ch === last} onClick={() => setCh(ch + 1)} icon={<ChevronRight size={16} />} />
      </Toolbar>
      <div className="relative h-[2px] shrink-0 bg-black/[0.04]">
        <div ref={bar} className="absolute inset-0 origin-left bg-[#0A84FF]/70" style={{ transform: "scaleX(0)" }} />
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto max-w-[66ch] px-8 pb-16 pt-10">
          <ChapterBody c={c} />
          {ch < last && (
            <button type="button" onClick={() => setCh(ch + 1)} className="press mx-auto mt-12 flex h-9 items-center gap-1 rounded-full bg-[var(--accent-tint)] px-4 text-[13px] font-semibold text-[var(--accent-text)]">
              {book.chapters[ch + 1].title} <ChevronRight size={15} />
            </button>
          )}
        </article>
      </div>
    </div>
  );
}

// On the phone the chapter is laid out in pages side by side; swipe or tap an edge to turn.
function PagedReader({ book, ch, setCh, start, onPos, onClose }: { book: Book; ch: number; setCh: (i: number) => void; start: number; onPos: (p: Pos) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const c = book.chapters[ch];
  const pageW = () => ref.current?.clientWidth ?? 1;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(1, Math.round(el.scrollWidth / pageW()));
    setPages(n);
    const p = Math.min(n - 1, Math.round(start * (n - 1)));
    el.scrollLeft = p * pageW();
    setPage(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);
  const go = (p: number) => {
    const el = ref.current;
    if (!el) return;
    if (p < 0) return void (ch > 0 && setCh(ch - 1));
    if (p >= pages) return void (ch < book.chapters.length - 1 && setCh(ch + 1));
    el.scrollTo({ left: p * pageW(), behavior: "smooth" });
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const p = Math.round(el.scrollLeft / pageW());
    if (p !== page) {
      setPage(p);
      onPos({ ch, at: pages > 1 ? p / (pages - 1) : 1 });
    }
  };
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", bounce: 0, duration: 0.42 }}
      className="fixed inset-0 z-[70] flex flex-col bg-white"
    >
      {/* the same row as every app's Close: 44pt under the status bar */}
      <div className="flex h-[calc(var(--phone-top)+52px)] shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-[calc(var(--phone-top)+4px)]">
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink-3">{c.title}</span>
        <button type="button" onClick={onClose} aria-label="Close book" data-glass="" className={`${glass("btn")} glass-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#3C3C43]/75`}>
          <X size={20} className="bold" />
        </button>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        onClick={(e) => {
          const x = e.clientX / window.innerWidth;
          if (x < 0.25) go(page - 1);
          else if (x > 0.75) go(page + 1);
        }}
        onScrollEnd={() => {
          // settle on the nearest page after a free swipe
          const el = ref.current;
          if (el) el.scrollTo({ left: Math.round(el.scrollLeft / pageW()) * pageW(), behavior: "smooth" });
        }}
        className="paged min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <article className="paged-cols h-full px-6 pb-2">
          <ChapterBody c={c} />
        </article>
      </div>
      <div className="flex h-[calc(var(--phone-bottom)+20px)] shrink-0 items-start justify-center pt-2 text-[12px] tabular-nums text-ink-3">
        {page + 1} of {pages}
      </div>
    </motion.div>
  );
}
