"use client";

// Finder: Projects, Games, Music, Photos, Documents.

import { ArrowDownToLine, ArrowDownUp, ChevronRight } from "lucide-react";
import { Sym, type PartName } from "../symbols";
import { useState } from "react";
import { owner, places, type AppId, type FinderItem, type PlaceId } from "@/content";
import { Resume } from "../shell";
import { useOS } from "@/store";
import { AppIcon, DocArt, FolderArt } from "../icons";
import { Btn, GlassMenu, TabBar, List, ListRow, SectionHeader, QuickLook, SearchField, Segmented, SplitView, Toolbar, useChrome, type LookItem } from "../ui";
import { player } from "./player";

// SF's sidebar symbols, from Lucide: folder, gamecontroller, music.note, photo, doc.text
const PLACE_SYM: Record<PlaceId, PartName> = { projects: "folder", games: "gamepad", music: "note", photos: "photo", documents: "doc" };

function FinderIcon({ it, size }: { it: FinderItem; size: number }) {
  if (it.look?.type === "resume") return <DocArt size={size} />;
  if (it.ext) return <DocArt size={size} label={it.ext} />;
  if (it.art)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={it.art} alt="" draggable={false} data-sq="" className="object-cover shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_2px_6px_rgb(0_0_0/0.14)]" style={{ width: size * 0.86, height: size * 0.86, borderRadius: size * 0.16 }} />;
  if (it.app) return <AppIcon id={it.app} size={size} />;
  return <FolderArt size={size} />;
}

const openAny = (id: AppId) => {
  const st = useOS.getState();
  if (st.isMobile) st.openPhoneApp(id);
  else st.open(id);
};

export function Finder({ start }: { start: PlaceId }) {
  const { compact } = useChrome();
  const [place, setPlace] = useState<string>(start);
  const [view, setView] = useState<"icons" | "list">("icons");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [look, setLook] = useState<LookItem | null>(null);
  const cur = places.find((p) => p.id === place) ?? places[0];
  const needle = q.trim().toLowerCase();
  const [sort, setSort] = useState<"default" | "name" | "kind">("default");
  const groups = cur.groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((it) => it.name.toLowerCase().includes(needle))
        .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "kind" ? a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) : 0)),
    }))
    .filter((g) => g.items.length);
  const count = groups.reduce((a, g) => a + g.items.length, 0);
  const picked = groups.flatMap((g) => g.items).find((it) => it.id === sel) ?? null;
  const run = (it: FinderItem) => {
    if (it.track) {
      openAny("records");
      player.play(it.track);
    } else if (it.note) {
      useOS.getState().setNote(it.note);
      openAny("notes");
    } else if (it.download) {
      // a real file: the browser saves it
      const a = document.createElement("a");
      a.href = it.download;
      a.download = it.name;
      a.click();
    } else if (it.app) openAny(it.app);
    else if (it.look) setLook(it.look.type === "resume" ? { title: it.name, node: <Resume /> } : { title: it.name, src: it.look.src });
  };
  const sections = [{ title: "Favourites", items: places.map((p) => ({ id: p.id, label: p.title, icon: <Sym icon={PLACE_SYM[p.id]} size={16} className="text-[var(--accent-text)]" /> })) }];
  const empty = <div className="t-sub py-16 text-center text-ink-3">{`Nothing here matches “${q.trim()}”.`}</div>;

  // the phone: Files. One tap opens.
  const phoneDetail = (
    <div className="px-4 pb-10">
      <div className="pb-3">
        <SearchField id={`finder-q-${start}`} value={q} onChange={setQ} />
      </div>
      {groups.map((g, i) => (
        <div key={g.title ?? i} className="mb-6">
          {g.title && <SectionHeader>{g.title}</SectionHeader>}
          <List>
            {g.items.map((it) => (
              <ListRow key={it.id} onClick={() => run(it)} icon={<span className="my-1.5 flex h-11 w-11 shrink-0 items-center justify-center"><FinderIcon it={it} size={44} /></span>} title={it.name} sub={it.kind} chevron={!it.download} detail={it.download ? <Sym icon={ArrowDownToLine} size={20} weight="medium" className="text-[var(--accent-text)]" /> : undefined} />
            ))}
          </List>
        </div>
      ))}
      {!count && empty}
    </div>
  );

  const macDetail = (
    <div className="flex h-full min-h-0 flex-col" onPointerDown={() => setSel(null)}>
      <Toolbar title={cur.title} sub={`${count} item${count === 1 ? "" : "s"}`}>
        <Segmented
          id={`finder-view-${start}`}
          value={view}
          onChange={setView}
          options={[
            { value: "icons", label: "Icons" },
            { value: "list", label: "List" },
          ]}
        />
        <GlassMenu
          label="Sort by"
          icon={<Sym icon={ArrowDownUp} size={14} weight="medium" />}
          value={sort}
          onChange={setSort}
          options={[
            { value: "default", label: "Sort" },
            { value: "name", label: "Name" },
            { value: "kind", label: "Kind" },
          ]}
        />
        <SearchField id={`finder-q-${start}`} value={q} onChange={setQ} />
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto px-5 pb-4">
        {groups.map((g, i) => (
          <section key={g.title ?? i} className="pb-3">
            {g.title && <h2 className="m-headline flex h-8 items-center px-1 text-ink-2 shadow-[inset_0_-0.5px_0_var(--separator-opaque)]">{g.title}</h2>}
            {view === "icons" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-y-2 pt-3">
                {g.items.map((it) => {
                  const on = sel === it.id;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      onPointerDown={(e) => (e.stopPropagation(), setSel(it.id))}
                      onDoubleClick={() => run(it)}
                      onKeyDown={(e) => e.key === "Enter" && run(it)}
                      className="group flex flex-col items-center gap-1.5 rounded-[12px] px-1 py-2 outline-none"
                    >
                      <span className={`flex h-[78px] w-[78px] items-center justify-center rounded-[16px] transition-colors duration-100 ${on ? "bg-[var(--selection)]" : "hov:group-hover:bg-[var(--hover)]"}`} data-sq="">
                        <FinderIcon it={it} size={60} />
                      </span>
                      <span className={`line-clamp-2 max-w-[108px] rounded-[7px] px-[6px] py-px text-center text-[12px] font-medium leading-[15px] ${on ? "bg-[var(--accent)] text-white" : "text-ink group-focus-visible:bg-[var(--accent)] group-focus-visible:text-white"}`}>{it.name}</span>
                      <span className="m-sub -mt-1 text-ink-3">{it.kind}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="pt-1">
                {g.items.map((it) => {
                  const on = sel === it.id;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      onPointerDown={(e) => (e.stopPropagation(), setSel(it.id))}
                      onDoubleClick={() => run(it)}
                      onKeyDown={(e) => e.key === "Enter" && run(it)}
                      className={`flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2 text-left outline-none ${on ? "bg-[var(--accent)] text-white" : "text-ink odd:bg-[var(--fill-2)] focus-visible:bg-[var(--accent)] focus-visible:text-white"}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <FinderIcon it={it} size={24} />
                      </span>
                      <span className="m-body min-w-0 flex-1 truncate font-medium">{it.name}</span>
                      <span className={`m-body w-[150px] shrink-0 truncate ${on ? "text-white/80" : "text-ink-2"}`}>{it.kind}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        ))}
        {!count && empty}
      </div>
      {/* the path bar: where you are, what's picked, and a plain way to open it */}
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-4 text-ink-2 shadow-[inset_0_0.5px_0_var(--separator-opaque)]" onPointerDown={(e) => e.stopPropagation()}>
        <span className="m-sub">{owner.name}</span>
        <Sym icon={ChevronRight} size={11} className="text-ink-3" weight="semibold" />
        <FolderArt size={16} glyph={cur.id} />
        <span className="m-sub">{cur.title}</span>
        {picked && (
          <>
            <Sym icon={ChevronRight} size={11} className="text-ink-3" weight="semibold" />
            <span className="m-sub truncate font-medium text-ink">{picked.name}</span>
          </>
        )}
        <span className="flex-1" />
        {picked ? (
          <Btn size="sm" variant="tinted" capsule onClick={() => run(picked)}>
            {picked.download ? "Download" : "Open"}
          </Btn>
        ) : (
          <span className="m-sub text-ink-3">Double-click to open</span>
        )}
      </div>
    </div>
  );

  if (compact)
    return (
      <>
        <h2 className="t-large px-4 pb-2 text-ink">{cur.title}</h2>
        <div className="pb-24">{phoneDetail}</div>
        <TabBar
          id={`finder-${start}`}
          value={place as PlaceId}
          onChange={(id) => {
            setPlace(id);
            setQ("");
          }}
          items={places.map((p) => ({ value: p.id, label: p.title, icon: <Sym icon={PLACE_SYM[p.id]} size={23} weight="medium" fill={place === p.id} /> }))}
        />
        <QuickLook items={look ? [look] : []} index={look ? 0 : null} onClose={() => setLook(null)} />
      </>
    );
  return (
    <>
      <SplitView
        selected={place}
        onSelect={(id) => {
          setPlace(id);
          setSel(null);
          setQ("");
        }}
        sections={sections}
        width={188}
        detail={macDetail}
      />
      <QuickLook items={look ? [look] : []} index={look ? 0 : null} onClose={() => setLook(null)} />
    </>
  );
}
