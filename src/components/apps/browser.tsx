"use client";

// A small browser for the desktop: the Browser app (a start page with his work as favourites) and every live-site
// window. It keeps its own history (the pages inside the frame are another origin, so their own navigation can't be
// read), loads what is typed in the address field (an address, or a search), and says so plainly when a site
// refuses to be shown inside another page instead of leaving a blank window.

import { ArrowUpRight, ChevronLeft, ChevronRight, Globe, RotateCw, Search, ShieldOff, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { owner, projects } from "@/content";
import { Btn, useChrome } from "../ui";

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
  if (bad) return <Globe size={size - 2} className="shrink-0 text-ink-2" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={favicon(url)} alt="" width={size} height={size} onError={() => setBad(true)} className="shrink-0 rounded-[3px]" style={{ width: size, height: size }} />;
}

// his work on the open web: every project with a link, then the studio and his X
export function favourites(): { name: string; url: string }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string }[] = [];
  for (const p of Object.values(projects)) {
    const href = p?.link?.href;
    if (!p || !href || seen.has(hostOf(href) + new URL(href).pathname)) continue;
    seen.add(hostOf(href) + new URL(href).pathname);
    out.push({ name: p.name, url: href });
  }
  if (!out.some((f) => hostOf(f.url) === hostOf(owner.studio.href))) out.push({ name: "Larpo", url: owner.studio.href });
  out.push({ name: "X", url: owner.x.href });
  return out;
}

function StartPage({ go }: { go: (url: string) => void }) {
  const favs = favourites();
  return (
    <div className="absolute inset-0 overflow-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-[640px] px-8 pb-12 pt-14">
        <h2 className="m-title text-ink">Favourites</h2>
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-3 gap-y-5">
          {favs.map((f) => (
            <button key={f.url} type="button" onClick={() => go(f.url)} className="press group flex flex-col items-center gap-2 rounded-[14px] p-1.5 text-center" data-favourite={hostOf(f.url)}>
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-[14px] bg-[var(--surface-2)] shadow-[0_0_0_0.5px_var(--separator)] transition-colors hov:group-hover:bg-[var(--hover)]">
                <Favicon url={f.url} size={28} />
              </span>
              <span className="m-sub w-full truncate text-ink">{f.name}</span>
            </button>
          ))}
        </div>
        <p className="m-sub mt-10 text-ink-3">Type an address or a search in the field above. Some sites don&rsquo;t allow being shown inside another page; those open in a new tab.</p>
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
          <ShieldOff size={24} strokeWidth={1.8} />
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
          <Btn variant="prominent" size="md" href={url} icon={<ArrowUpRight size={15} />}>
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
        <Btn variant="plain" size="sm" iconOnly label="Back" disabled={hist.at === 0} onClick={back} icon={<ChevronLeft size={17} />} />
        <Btn variant="plain" size="sm" iconOnly label="Forward" disabled={hist.at >= hist.list.length - 1} onClick={forward} icon={<ChevronRight size={17} />} />
        <form onSubmit={submit} data-no-drag="" className="search relative mx-auto flex h-[32px] min-w-0 w-[min(480px,100%)] items-center gap-1.5 pl-3 pr-1" role="search">
          {editing ? (
            <Search size={13} className="shrink-0 text-ink-3" aria-hidden />
          ) : url ? (
            first && lead ? lead : <Favicon url={url} size={15} />
          ) : (
            <Search size={13} className="shrink-0 text-ink-3" aria-hidden />
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
              <X size={13} />
            </button>
          ) : (
            url && (
              <button type="button" aria-label="Reload" onClick={reload} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-2 hov:hover:bg-[var(--hover)]">
                {loading ? <X size={13} /> : <RotateCw size={12} />}
              </button>
            )
          )}
          {/* the page loading: a thin line along the bottom of the field, like Safari's */}
          <span aria-hidden className={`pointer-events-none absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full transition-opacity duration-300 ${loading ? "opacity-100" : "opacity-0"}`}>
            <span key={`${hist.at}-${nonce}`} className={`browser-progress block h-full rounded-full bg-[var(--accent)] ${loading ? "is-loading" : "is-done"}`} />
          </span>
        </form>
        <Btn variant="plain" size="sm" iconOnly label="Open in New Tab" href={url || undefined} disabled={!url} icon={<ArrowUpRight size={15} />} />
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
        <div className="overflow-hidden rounded-[12px] bg-[var(--bg-elevated)]">
          {favourites().map((f, i) => (
            <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="press-row flex min-h-[52px] items-center gap-3 pl-4">
              <Favicon url={f.url} size={22} />
              <span className={`flex min-h-[52px] flex-1 items-center justify-between pr-4 ${i ? "border-t-[0.5px] border-[var(--separator)]" : ""}`}>
                <span className="text-[17px] text-ink">{f.name}</span>
                <ArrowUpRight size={16} className="text-ink-3" />
              </span>
            </a>
          ))}
        </div>
      </div>
    );
  return <Browser title="Browser" />;
}
