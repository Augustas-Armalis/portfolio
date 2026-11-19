"use client";

// Shots and Gallery: one Photos-style grid with Quick Look.

import { useState } from "react";
import { novel, shots } from "@/content";
import { Btn, dragFile, useContextMenu, QuickLook, SearchField, Segmented, Toolbar, useChrome, type LookItem } from "../ui";
import { type Photo, XMark } from "./shared";

// aspect "wide" keeps 16:10 screenshots whole; "square" is the Photos grid
function PhotosApp({ title, sub, photos, actions, credit, aspect = "square" }: { title: string; sub?: string; photos: Photo[]; actions?: React.ReactNode; credit?: string; aspect?: "square" | "wide" }) {
  const { compact } = useChrome();
  const [q, setQ] = useState("");
  const [size, setSize] = useState<"grid" | "large">("grid");
  const [look, setLook] = useState<number | null>(null);
  const ctx = useContextMenu();
  const list = photos.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase()));
  const looks: LookItem[] = list.map((s) => ({ title: s.title, src: s.src }));
  const wide = aspect === "wide";
  return (
    <div className="@container relative flex h-full min-h-0 flex-col bg-[var(--bg)]">
      {!compact && (
        <Toolbar title={title} sub={sub}>
          <Segmented
            id={`ph-${title}`}
            value={size}
            onChange={setSize}
            options={[
              { value: "grid", label: "Grid" },
              { value: "large", label: "Large" },
            ]}
          />
          <SearchField id={`ph-search-${title}`} value={q} onChange={setQ} />
          {actions}
        </Toolbar>
      )}
      {compact && (
        <div className="space-y-3 px-4 pb-3">
          {sub && <div className="t-foot text-ink-2">{sub}</div>}
          <SearchField id={`ph-search-${title}`} value={q} onChange={setQ} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className={`grid gap-[2px] ${
            compact
              ? wide
                ? "grid-cols-2"
                : "grid-cols-3"
              : size === "grid"
                ? wide
                  ? "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(170px,1fr))]"
                : wide
                  ? "grid-cols-[repeat(auto-fill,minmax(460px,1fr))]"
                  : "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
          }`}
        >
          {list.map((ph, i) => (
            <button
              type="button"
              key={ph.src}
              onClick={() => setLook(i)}
              onContextMenu={(e) =>
                ctx.open(e, [
                  { label: "Quick Look", hint: "Space", run: () => setLook(i) },
                  { label: "Open in New Tab", run: () => window.open(ph.src, "_blank", "noreferrer") },
                ])
              }
              className={`group relative overflow-hidden bg-[var(--fill-2)] outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${wide ? "aspect-[16/10]" : "aspect-square"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ph.src}
                alt={ph.title}
                loading="lazy"
                {...dragFile(ph.title, ph.src)}
                className="h-full w-full object-cover transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hov:group-hover:scale-[1.03]"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-2 pb-1.5 pt-6 text-left text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 hov:group-hover:opacity-100">
                {ph.title}
              </span>
            </button>
          ))}
        </div>
        {!list.length && <div className="t-sub py-16 text-center text-ink-3">{`No photos match “${q.trim()}”.`}</div>}
        {credit && <div className="m-sub px-4 py-4 text-center text-ink-3">{credit}</div>}
      </div>
      <QuickLook items={looks} index={look} onIndex={setLook} onClose={() => setLook(null)} />
      {ctx.node}
    </div>
  );
}

export function Shots() {
  return (
    <PhotosApp
      title="Shots"
      aspect="wide"
      photos={shots.items}
      actions={
        <Btn size="sm" href={shots.href} label={`Open ${shots.handle} on X`} icon={<XMark size={12} />}>
          {shots.handle}
        </Btn>
      }
    />
  );
}

// The Art persona's Gallery: the novel's chapter illustrations, credited to their illustrator.
const illustrations: Photo[] = Array.from({ length: 20 }, (_, i) => ({ title: `${i + 1} Skyrius`, src: `/content/novel/ch${String(i + 1).padStart(2, "0")}.png` }));

export function Gallery() {
  return <PhotosApp title="Gallery" sub="Illustrations for the novel" photos={illustrations} credit={`Iliustracijos: ${novel.illustrator}`} />;
}
