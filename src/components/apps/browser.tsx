"use client";

// A small browser for the desktop: the Browser app (a start page with his work as favourites) and every live-site
// window. It keeps its own history (the pages inside the frame are another origin, so their own navigation can't be
// read), loads what is typed in the address field (an address, or a search), and says so plainly when a site
// refuses to be shown inside another page instead of leaving a blank window.

import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Github, Globe, Instagram, Linkedin, RotateCw, Search, ShieldOff, X } from "lucide-react";
import { Sym } from "../symbols";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { bookCall, contactList, projects, type AppId, type Channel } from "@/content";
import { AppIcon } from "../icons";
import { Btn, List, ListRow, SectionHeader, useChrome } from "../ui";
import { XMark } from "./shared";
import { useOS } from "@/store";

// Searches go to Bing: it is the one large engine that lets itself be shown in a frame (Google, DuckDuckGo, Brave,
// Qwant, Ecosia and Startpage all send X-Frame-Options or frame-ancestors).
const SEARCH = "https://www.bing.com/search?q=";

/** What the address field turns into: an address as typed, a bare domain with https://, anything else a search. */
export function toUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^(localhost|[\w-]+(\.[\w-]+)*\.[a-z]{2,})(:\d+)?([/?#].*)?$/i.test(s)) return `https://${s}`;
  return SEARCH + encodeURIComponent(s);
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Sites known to refuse framing (X-Frame-Options or CSP frame-ancestors). Their error can't be read from outside the
// frame, so they get the explanation at once instead of a browser error inside the window.
const NO_FRAME = [
  "google.", "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "threads.net", "linkedin.com",
  "github.com", "gitlab.com", "reddit.com", "amazon.", "apple.com", "duckduckgo.com", "wikipedia.org", "stackoverflow.com",
  "medium.com", "figma.com", "notion.so", "dribbble.com", "behance.net", "chatgpt.com", "openai.com", "tiktok.com",
  "pinterest.", "netflix.com", "vercel.com", "brave.com", "qwant.com", "ecosia.org", "startpage.com", "bsky.app",
];
const refusesFrames = (url: string) => {
  const h = hostOf(url);
  if (/youtube\.com$/.test(h) && /\/embed\//.test(url)) return false;
  return NO_FRAME.some((d) => (d.endsWith(".") ? h.startsWith(d) || h.includes(`.${d}`) : h === d || h.endsWith(`.${d}`)));
};

// a page that hasn't said it loaded by then is treated as refused
const TIMEOUT = 10000;

export const favicon = (url: string) => `https://icons.duckduckgo.com/ip3/${hostOf(url)}.ico`;

function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [url]);
  if (bad) return <Sym icon={Globe} size={size - 2} className="shrink-0 text-ink-2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={favicon(url)} alt="" width={size} height={size} onError={() => setBad(true)} className="shrink-0 rounded-[3px]" style={{ width: size, height: size }} />;
}

// The start page, like Safari's: his work on the open web under Favourites (every project with a link, wearing its
// own icon), and where else he is under Elsewhere. Only real links: a channel he hasn't confirmed is left out.
type Fav = { name: string; url: string; app?: AppId; sub: string; glyph?: ReactNode };
export function favourites(): Fav[] {
  const seen = new Set<string>();
  const out: Fav[] = [];
  for (const p of Object.values(projects)) {
    const href = p?.link?.href;
    if (!p || !href || seen.has(hostOf(href) + new URL(href).pathname)) continue;
    seen.add(hostOf(href) + new URL(href).pathname);
    out.push({ name: p.name, url: href, app: p.id as AppId, sub: hostOf(href) });
  }
  return out;
}
const GLYPH: Partial<Record<Channel["id"], ReactNode>> = {
  x: <XMark size={24} />,
  linkedin: <Sym icon={Linkedin} size={26} weight="medium" />,
  instagram: <Sym icon={Instagram} size={26} weight="medium" />,
  github: <Sym icon={Github} size={26} weight="medium" />,
};
export function elsewhere(): Fav[] {
  const links = contactList.filter((c) => c.href && c.id !== "website" && c.id !== "email").map((c) => ({ name: c.label, url: c.href!, sub: c.value, glyph: GLYPH[c.id] ?? <Sym icon={Globe} size={26} weight="medium" /> }));
  return [...links, { name: bookCall.label, url: bookCall.href, sub: bookCall.sub, glyph: <Sym icon={CalendarDays} size={26} weight="medium" /> }];
}
// one tile: a project's own icon, or a glyph on a quiet squircle of the same size
function FavTile({ f, size }: { f: Fav; size: number }) {
  if (f.app) return <AppIcon id={f.app} size={size} />;
  return (
    <span className="flex items-center justify-center bg-[var(--surface-2)] text-ink shadow-[0_0_0_0.5px_var(--separator)]" data-sq="" style={{ width: size, height: size, borderRadius: size * 0.225 }}>
      {f.glyph}
    </span>
  );
}

function StartPage({ go }: { go: (url: string) => void }) {
  const groups = [
    { title: "Favourites", items: favourites() },
    { title: "Elsewhere", items: elsewhere() },
  ];
  return (
    <div className="absolute inset-0 overflow-auto bg-[var(--bg)]">
      {/* one column in the middle of the page, as wide as four tiles: both rows share its left edge */}
      <div className="mx-auto flex min-h-full w-[472px] max-w-full flex-col justify-center px-4 py-10">
        {groups.map((g) => (
          <section key={g.title} className="pb-8">
            <h2 className="m-headline px-1 text-ink-2">{g.title}</h2>
            <div className="mt-3 grid grid-cols-4 gap-y-5">
              {g.items.map((f) => (
                <button
                  key={f.url}
                  type="button"
                  // a site that refuses to sit in a frame opens in a tab of its own, at once
                  onClick={() => (refusesFrames(f.url) ? window.open(f.url, "_blank", "noreferrer") : go(f.url))}
                  className="press group flex flex-col items-center gap-2 rounded-[16px] px-1 py-1.5 text-center outline-none focus-visible:bg-[var(--hover)]"
                  data-favourite={hostOf(f.url)}
                >
                  <span className="transition-transform duration-200 ease-out hov:group-hover:scale-[1.04]">
                    <FavTile f={f} size={64} />
                  </span>
                  <span className="w-full min-w-0">
                    <span className="m-body block truncate font-medium text-ink">{f.name}</span>
                    <span className="m-sub block truncate text-ink-3">{f.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        <p className="m-sub px-1 text-ink-3 [text-wrap:pretty]">Type an address or a search in the field above. Some sites don&rsquo;t allow being shown inside another page; those open in a new tab.</p>
      </div>
    </div>
  );
}

function Refused({ url, slow }: { url: string; slow: boolean }) {
  const host = hostOf(url);
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-auto bg-[var(--bg)] p-8" data-refused={host}>
      <div className="flex max-w-[360px] flex-col items-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[var(--surface-2)] text-ink-2 shadow-[0_0_0_0.5px_var(--separator)]">
          <Sym icon={ShieldOff} size={24} weight="medium" />
        </span>
        <h2 className="m-title mt-5 text-ink">This site can&rsquo;t be shown here</h2>
        <p className="m-body mt-2 text-ink-2">
          {slow ? (
            <>{host} didn&rsquo;t load inside this window. It may not allow being shown inside another page.</>
          ) : (
            <>{host} doesn&rsquo;t allow other pages to show it inside a window. It opens fine in a new tab.</>
          )}
        </p>
        <div className="mt-6">
          <Btn variant="prominent" size="md" href={url} icon={<Sym icon={ArrowUpRight} size={15} weight="medium" />}>
            Open in New Tab
          </Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * start: the first page (null for the start page). lead: what stands in the field before the domain for the first
 * page (a project's own icon). end: more toolbar buttons. side: a panel beside the page (a project's inspector).
 */
export function Browser({ start = null, title, lead, end, side }: { start?: string | null; title: string; lead?: ReactNode; end?: ReactNode; side?: ReactNode }) {
  const [hist, setHist] = useState<{ list: string[]; at: number }>({ list: [start ?? ""], at: 0 });
  const url = hist.list[hist.at];
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "done" | "refused" | "slow">(url ? (refusesFrames(url) ? "refused" : "loading") : "idle");
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // every new page (or a reload) starts loading; one that never says it loaded is treated as refused
  useEffect(() => {
    if (!url) return setState("idle");
    if (refusesFrames(url)) return setState("refused");
    setState("loading");
    const t = window.setTimeout(() => setState((s) => (s === "loading" ? "slow" : s)), TIMEOUT);
    return () => window.clearTimeout(t);
  }, [url, nonce]);

  const go = (to: string) => {
    if (!to) return;
    setHist((h) => (h.list[h.at] === to ? h : { list: [...h.list.slice(0, h.at + 1), to], at: h.at + 1 }));
    if (to === url) setNonce((n) => n + 1);
  };
  const back = () => setHist((h) => ({ ...h, at: Math.max(0, h.at - 1) }));
  const forward = () => setHist((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }));
  const reload = () => url && setNonce((n) => n + 1);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const to = toUrl(text);
    if (!to) return;
    go(to);
    setEditing(false);
    field.current?.blur();
  };

  // ⌘L puts the cursor in the address field, like any browser
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current?.closest("[data-win]");
    if (!el) return;
    const key = (e: Event) => {
      const k = e as KeyboardEvent;
      if ((k.metaKey || k.ctrlKey) && k.key.toLowerCase() === "l") {
        k.preventDefault();
        field.current?.focus();
      }
    };
    el.addEventListener("keydown", key);
    return () => el.removeEventListener("keydown", key);
  }, []);

  const host = url ? hostOf(url) : "";
  const first = hist.at === 0 && url === (start ?? "");
  const loading = state === "loading";

  return (
    <div ref={root} className="@container/site flex h-full min-h-0 flex-col" data-browser="">
      <div data-drag className="toolbar relative flex h-[52px] shrink-0 items-center gap-1.5 border-b border-[var(--separator)] pl-[84px] pr-3">
        <Btn variant="plain" size="sm" iconOnly label="Back" disabled={hist.at === 0} onClick={back} icon={<Sym icon={ChevronLeft} size={17} weight="semibold" />} />
        <Btn variant="plain" size="sm" iconOnly label="Forward" disabled={hist.at >= hist.list.length - 1} onClick={forward} icon={<Sym icon={ChevronRight} size={17} weight="semibold" />} />
        <form onSubmit={submit} data-no-drag="" className="search relative mx-auto flex h-[32px] min-w-0 w-[min(480px,100%)] items-center gap-1.5 pl-3 pr-1" role="search">
          {editing ? (
            <Sym icon={Search} size={14} weight="medium" className="shrink-0 text-ink-3" />
          ) : url ? (
            first && lead ? lead : <Favicon url={url} size={15} />
          ) : (
            <Sym icon={Search} size={14} weight="medium" className="shrink-0 text-ink-3" />
          )}
          <input
            ref={field}
            value={editing ? text : host}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => {
              setEditing(true);
              setText(url);
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                field.current?.blur();
              }
            }}
            placeholder="Search or enter website name"
            aria-label="Address and search"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={`m-body min-w-0 flex-1 bg-transparent font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3 ${editing ? "text-left" : "truncate text-center"}`}
          />
          {editing && text ? (
            <button type="button" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => setText("")} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 hov:hover:text-ink-2">
              <Sym icon={X} size={13} weight="semibold" />
            </button>
          ) : (
            url && (
              <button type="button" aria-label="Reload" onClick={reload} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-2 hov:hover:bg-[var(--hover)]">
                {loading ? <Sym icon={X} size={13} weight="semibold" /> : <Sym icon={RotateCw} size={13} weight="semibold" />}
              </button>
            )
          )}
          {/* the page loading: a thin line along the bottom of the field, like Safari's */}
          <span aria-hidden className={`pointer-events-none absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full transition-opacity duration-300 ${loading ? "opacity-100" : "opacity-0"}`}>
            <span key={`${hist.at}-${nonce}`} className={`browser-progress block h-full rounded-full bg-[var(--accent)] ${loading ? "is-loading" : "is-done"}`} />
          </span>
        </form>
        <Btn variant="plain" size="sm" iconOnly label="Open in New Tab" href={url || undefined} disabled={!url} icon={<Sym icon={ArrowUpRight} size={15} weight="medium" />} />
        {end}
      </div>
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1 bg-[var(--bg)]">
          {!url ? (
            <StartPage go={go} />
          ) : state === "refused" || state === "slow" ? (
            <Refused url={url} slow={state === "slow"} />
          ) : (
            <iframe
              key={`${hist.at}-${nonce}`}
              src={url}
              title={first ? title : host}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              onLoad={() => setState((s) => (s === "loading" ? "done" : s))}
              className={`absolute inset-0 h-full w-full border-0 bg-white transition-opacity duration-300 ${state === "done" ? "opacity-100" : "opacity-0"}`}
            />
          )}
          {loading && (
            <div className="pointer-events-none absolute inset-0 space-y-3 p-8" aria-hidden>
              <div className="skeleton h-8 w-1/3 rounded-[10px]" />
              <div className="skeleton h-48 w-full rounded-[20px]" />
              <div className="skeleton h-4 w-2/3 rounded-[6px]" />
              <div className="skeleton h-4 w-1/2 rounded-[6px]" />
            </div>
          )}
        </div>
        {side}
      </div>
    </div>
  );
}

export function BrowserApp() {
  const { compact } = useChrome();
  // a phone has a browser of its own: there the favourites simply open in it
  if (compact)
    return (
      <div className="px-4 pb-10">
        {[
          { title: "Favourites", items: favourites() },
          { title: "Elsewhere", items: elsewhere() },
        ].map((g) => (
          <div key={g.title} className="mb-6">
            <SectionHeader>{g.title}</SectionHeader>
            <List>
              {g.items.map((f) => (
                <ListRow
                  key={f.url}
                  href={f.url}
                  icon={
                    <span className="my-1.5 flex h-11 w-11 shrink-0 items-center justify-center">
                      <FavTile f={f} size={40} />
                    </span>
                  }
                  title={f.name}
                  sub={f.sub}
                  detail={<Sym icon={ArrowUpRight} size={18} weight="medium" className="text-[var(--label-3)]" />}
                />
              ))}
            </List>
          </div>
        ))}
      </div>
    );
  // a page sent from elsewhere (a project's Visit button, the Easter egg) opens in a fresh browser
  const sent = useOS((st) => st.browserUrl);
  return <Browser key={sent?.t ?? 0} start={sent?.url ?? null} title="Browser" />;
}
