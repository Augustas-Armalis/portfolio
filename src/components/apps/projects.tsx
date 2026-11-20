"use client";

// Projects: story pages, the repository view and the live site with its inspector.

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Download, FileText, Folder, Github, Info, Lock, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bookCall, projectGroups, projects, type AppId } from "@/content";
import { AppIcon } from "../icons";
import { Badge, Btn, dragFile, glass, InfoGrid, List, ListRow, SectionHeader, Squircle, StatsRow, QuickLook, Toolbar, useChrome } from "../ui";
import { type StoryItem, CROP, ShotImg, storyImage, isShot, SHOT_BG } from "./shared";
import { Browser } from "./browser";

// One card face for every story. Photo stories put the app icon on the picture; screenshot stories float the
// screenshot over a wallpaper, like an App Store feature.
function CardFace({ it, big, open }: { it: StoryItem; big?: boolean; open?: boolean }) {
  const { compact } = useChrome();
  const pad = compact ? "p-5" : big || open ? "p-7" : "p-5";
  const shot = isShot(it);
  return (
    <>
      <motion.div layoutId={`art-${it.key}`} className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot ? SHOT_BG[it.key] ?? "/wallpapers/engineer-pawel-structure.webp" : storyImage(it)} alt="" draggable={false} className="h-full w-full object-cover" />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.42)_0%,rgb(0_0_0/0.08)_38%,rgb(0_0_0/0)_55%,rgb(0_0_0/0.5)_100%)]" />
      {shot && (
        <div className={`absolute inset-x-0 bottom-0 flex justify-center ${CROP[storyImage(it)] ? "items-center pb-[6%]" : "items-start"} ${open ? (compact ? "top-[calc(var(--phone-top)+172px)]" : "top-[190px]") : "top-[38%]"}`}>
          <Squircle radius={16} className="w-[84%] overflow-hidden shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7),0_0_0_0.5px_rgb(255_255_255/0.2)]">
            <ShotImg src={storyImage(it)} alt="" draggable={false} />
          </Squircle>
        </div>
      )}
      {/* in a window the headline starts under the traffic lights; on the phone the picture runs to the top edge and
          the headline starts under the status bar and the Close row */}
      <motion.div layoutId={`head-${it.key}`} className={`absolute inset-x-0 top-0 ${pad} ${open ? (compact ? "pt-[calc(var(--phone-top)+60px)]" : "pt-[56px]") : ""}`}>
        <div className="eyebrow text-white/75">{it.eyebrow}</div>
        <div className={`mt-1 max-w-[18ch] font-bold leading-[1.05] tracking-[-0.025em] text-white [text-wrap:balance] ${open ? (compact ? "text-[34px]" : "text-[40px]") : big ? "text-[34px]" : "text-[26px]"}`}>
          {it.p.name}
        </div>
        {it.p.what && (shot || open) && <p className={`mt-1.5 text-white/85 [text-wrap:pretty] ${open && !compact ? "t-body max-w-[56ch]" : "t-sub max-w-[34ch]"}`}>{it.p.what}</p>}
      </motion.div>
      {/* photo stories: the app icon, then the one-liner, stacked from the bottom edge so neither can collide */}
      {!shot && (
        <div className={`absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 ${pad}`}>
          {it.app && <AppIcon id={it.app} size={big || open ? 64 : 52} />}
          {it.p.what && !open && (
            <motion.p layoutId={`sub-${it.key}`} className={`max-w-[46ch] text-white/90 [text-wrap:pretty] ${big ? "t-body" : "t-sub"}`}>
              {it.p.what}
            </motion.p>
          )}
        </div>
      )}
    </>
  );
}

// One full story: hero, the app row with its button, then sections, screenshots, numbers and information.
function Story({ it, standalone }: { it: StoryItem; standalone?: boolean }) {
  const { compact } = useChrome();
  const p = it.p;
  const pics = [p.image, ...(p.images ?? [])].filter((x): x is string => !!x);
  const [look, setLook] = useState<number | null>(null);
  const cta = p.link ? { label: "Visit", href: p.link.href } : it.app && projectGroups[1].apps.includes(it.app) ? { label: "Book a call", href: bookCall.href } : null;
  const stats = [
    ...p.numbers.map((n) => ({ k: n.label, v: n.value })),
    ...(p.years ? [{ k: "Since", v: p.years.split(/[ –]/)[0] }] : []),
    ...(it.status ? [{ k: "Status", v: it.status }] : []),
  ].slice(0, 4);
  const info = [
    p.role && { k: "Role", v: p.role },
    p.years && { k: "When", v: p.years },
    p.stack && { k: "Built with", v: p.stack },
    it.status && { k: "Status", v: it.status },
    p.link && { k: "Website", v: p.link.label },
  ].filter((x): x is { k: string; v: string } => !!x);
  const pad = compact ? "px-5" : "px-10 @max-[559px]:px-6";
  return (
    <article className="@container bg-white pb-12">
      <div data-drag={standalone && !compact ? "" : undefined} className={`relative w-full overflow-hidden ${compact ? "h-[calc(125vw+var(--phone-top))]" : "h-[420px]"}`}>
        <CardFace it={it} big open />
      </div>
      <div className={`${pad} flex items-center gap-3.5 border-b border-black/[0.08] py-5`}>
        <AppIcon id={it.app ?? "projects"} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold tracking-[-0.02em] text-ink">{p.name}</div>
          <div className="truncate text-[13px] text-[var(--label-2)]">{p.stack ?? p.role ?? it.eyebrow}</div>
        </div>
        {it.action ? (
          <Btn variant="prominent" capsule onClick={it.action.run} className="!px-4 !text-[15px] !font-bold">
            {it.action.label}
          </Btn>
        ) : (
          cta && (
            <Btn variant="prominent" capsule href={cta.href} className="!px-4 !text-[15px] !font-bold">
              {cta.label}
            </Btn>
          )
        )}
      </div>
      {stats.length > 0 && (
        <div className={`${pad} border-b border-[var(--separator)] py-4`}>
          <StatsRow stats={stats} />
        </div>
      )}
      {pics.length > 0 && (
        <section className="pt-8">
          <h2 className={`${pad} mb-3 text-[22px] font-bold tracking-[-0.02em] text-ink`}>Preview</h2>
          <div className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] ${compact ? "scroll-px-5 px-5" : "scroll-px-10 px-10"}`}>
            {pics.map((src, i) => (
              <button
                type="button"
                key={src}
                onClick={() => setLook(i)}
                className={`press lift sq-card shrink-0 snap-start overflow-hidden rounded-[18px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${compact ? "w-[82%]" : "w-[min(520px,70%)]"}`}
                data-sq=""
              >
                <ShotImg src={src} alt={`${p.name} ${i + 1}`} {...dragFile(`${p.name} ${i + 1}`, src)} />
              </button>
            ))}
          </div>
        </section>
      )}
      {info.length > 0 && (
        <section className={`${pad} pt-8`}>
          <h2 className="mb-1 text-[22px] font-bold tracking-[-0.02em] text-ink">Information</h2>
          <InfoGrid rows={info} cols={compact ? 1 : 2} />
        </section>
      )}
      <QuickLook items={pics.map((src, i) => ({ title: `${p.name} ${i + 1}`, src }))} index={look} onIndex={setLook} onClose={() => setLook(null)} />
    </article>
  );
}

// ---------- Photos: a tight grid; a photo zooms out of its tile into the viewer ----------

export function ProjectApp({ id }: { id: AppId }) {
  const p = projects[id];
  if (!p) return null;
  const group = projectGroups.find((g) => g.apps.includes(id));
  const it: StoryItem = { key: id, p, app: id, eyebrow: p.kind === "case" ? "Case study" : group?.id === "lab" ? "From the Lab" : p.status === "Live" ? "Live now" : (group?.title ?? "Project"), status: p.status };
  // a website shows itself beside its explanation; code shows its repository; everything else tells its story
  if (p.link && p.embeddable) return <LiveSite it={it} />;
  if (p.kind === "code") return <RepoView it={it} />;
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <Story it={it} standalone />
    </div>
  );
}

// ---------- Repository view: files, a README, and the way to the source ----------

// The key files of a project of this kind. A stand-in for the listing until the repositories are public: it follows
// from the stack in content.ts, nothing is fetched.
// A public repository shows what is really in it: the file list and the README come from GitHub when the
// window opens. Nothing is made up; a project without a public repository shows no files at all.
type RepoData = { files: { name: string; dir: boolean }[]; readme: string | null };

const repoCache = new Map<string, Promise<RepoData>>();

function loadRepo(slug: string) {
  let hit = repoCache.get(slug);
  if (!hit) {
    const api = `https://api.github.com/repos/${slug}`;
    hit = Promise.all([
      fetch(`${api}/contents`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("contents")))),
      fetch(`${api}/readme`, { headers: { Accept: "application/vnd.github.raw+json" } })
        .then((r) => (r.ok ? r.text() : null))
        .catch(() => null),
    ]).then(([list, readme]) => ({
      files: (list as { name: string; type: string }[])
        .map((f) => ({ name: f.name, dir: f.type === "dir" }))
        .sort((x, y) => Number(y.dir) - Number(x.dir) || x.name.localeCompare(y.name)),
      readme,
    }));
    repoCache.set(slug, hit);
    hit.catch(() => repoCache.delete(slug));
  }
  return hit;
}

// Enough Markdown for a README: headings, lists, code fences and paragraphs. Images, badges and HTML are dropped.
function Readme({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  const inline = (t: string) =>
    t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1")
      .trim();
  const lines = text.split("\n");
  let code: string[] | null = null;
  let para: string[] = [];
  const flush = () => {
    const t = inline(para.join(" "));
    if (t) out.push(<p key={out.length} className="t-sub mt-2 text-ink-2 [text-wrap:pretty]">{t}</p>);
    para = [];
  };
  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (code) {
        out.push(<pre key={out.length} className="mt-2 overflow-x-auto rounded-[10px] bg-[var(--fill-2)] p-3 font-mono text-[12px] leading-[1.5] text-ink">{code.join("\n")}</pre>);
        code = null;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(raw);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    const li = /^\s*[-*+]\s+(.*)$/.exec(raw) ?? /^\s*\d+\.\s+(.*)$/.exec(raw);
    if (h) {
      flush();
      const t = inline(h[2]);
      if (t) out.push(h[1].length === 1 ? <h2 key={out.length} className="t-title3 text-ink">{t}</h2> : <h3 key={out.length} className="m-headline mt-4 text-ink">{t}</h3>);
    } else if (li) {
      flush();
      const t = inline(li[1]);
      if (t) out.push(<div key={out.length} className="t-sub mt-1 flex gap-2 text-ink-2"><span aria-hidden>•</span><span className="min-w-0">{t}</span></div>);
    } else if (!raw.trim()) flush();
    else para.push(raw.trim());
  }
  flush();
  return <>{out}</>;
}

function RepoView({ it }: { it: StoryItem }) {
  const { compact } = useChrome();
  const p = it.p;
  const [repo, setRepo] = useState<RepoData | null>(null);
  const [repoState, setRepoState] = useState<"idle" | "loading" | "failed">(p.repo ? "loading" : "idle");
  useEffect(() => {
    if (!p.repo) return;
    let dead = false;
    loadRepo(p.repo.replace(/^https?:\/\/github\.com\//, ""))
      .then((d) => !dead && (setRepo(d), setRepoState("idle")))
      .catch(() => !dead && setRepoState("failed"));
    return () => {
      dead = true;
    };
  }, [p.repo]);
  const langs = (p.stack ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const slug = p.repo ? p.repo.replace(/^https?:\/\/github\.com\//, "") : p.name.toLowerCase().replace(/\s+/g, "-");
  const actions = p.repo ? (
    <>
      <Btn size={compact ? "md" : "sm"} href={`${p.repo}/archive/refs/heads/main.zip`} icon={<Download size={14} />}>
        Download
      </Btn>
      <Btn size={compact ? "md" : "sm"} variant="prominent" href={p.repo} icon={<Github size={14} />}>
        View on GitHub
      </Btn>
    </>
  ) : (
    <Badge>Source not public yet</Badge>
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-grouped)]">
      {!compact && (
        <Toolbar title={p.name} sub={slug}>
          {actions}
        </Toolbar>
      )}
      <div className={`@container min-h-0 flex-1 overflow-auto ${compact ? "px-4 pb-10" : "px-6 pb-8 pt-1"}`}>
        <div className="flex items-center gap-4">
          {it.app && <AppIcon id={it.app} size={compact ? 60 : 64} />}
          <div className="min-w-0 flex-1">
            <h1 className={compact ? "t-title2 text-ink" : "m-large text-ink"}>{p.name}</h1>
            {p.what && <p className={`mt-0.5 text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "m-body"}`}>{p.what}</p>}
          </div>
        </div>
        {compact && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        <div className={`mt-5 grid gap-5 ${compact ? "" : "grid-cols-[minmax(0,1fr)_220px] @max-[559px]:grid-cols-1"}`}>
          <div className="min-w-0 space-y-5">
            {p.repo && (
              <div>
                <SectionHeader mac={!compact}>Files</SectionHeader>
                <List mac={!compact}>
                  {repo ? (
                    repo.files.map((f) => (
                      <ListRow
                        key={f.name}
                        mac={!compact}
                        href={`${p.repo}/${f.dir ? "tree" : "blob"}/HEAD/${f.name}`}
                        icon={<span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--accent)]">{f.dir ? <Folder size={16} fill="currentColor" fillOpacity={0.18} /> : <FileText size={15} className="text-ink-2" />}</span>}
                        title={<span className="font-mono text-[12.5px]">{f.name}</span>}
                        chevron={compact}
                      />
                    ))
                  ) : repoState === "loading" ? (
                    <div className="space-y-2.5 p-4" aria-label="Loading files from GitHub" role="status">
                      {[52, 38, 64, 44].map((w) => (
                        <div key={w} className="skeleton h-4 rounded-[6px]" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  ) : (
                    <div className={`p-4 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>GitHub didn&apos;t answer. The files are one tap away with View on GitHub.</div>
                  )}
                </List>
              </div>
            )}
            <div>
              <SectionHeader mac={!compact}>{repo?.readme ? "README.md" : "Overview"}</SectionHeader>
              <List mac={!compact} className="p-5">
                {repo?.readme ? (
                  <Readme text={repo.readme} />
                ) : (
                  <>
                    <h2 className="t-title3 text-ink">{p.name}</h2>
                    {p.what && <p className="t-sub mt-2 text-ink-2 [text-wrap:pretty]">{p.what}</p>}
                    {langs.length > 0 && (
                      <>
                        <h3 className="m-headline mt-4 text-ink">Built with</h3>
                        <ul className="t-sub mt-1 list-disc pl-5 text-ink-2">
                          {langs.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {!p.repo && <p className="t-foot mt-4 text-ink-3">The source isn&apos;t public yet, so there are no files to show.</p>}
                  </>
                )}
              </List>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <SectionHeader mac={!compact}>About</SectionHeader>
              <List mac={!compact} className="px-3 py-1">
                <InfoGrid
                  cols={1}
                  rows={[
                    ...(p.stack ? [{ k: "Stack", v: p.stack }] : []),
                    ...p.numbers.map((n) => ({ k: n.label, v: n.value })),
                    { k: "Kind", v: "Repository" },
                    { k: "From", v: "The Lab" },
                  ]}
                />
              </List>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Safari-style: the live site in the window, with an Info inspector ----------

function Inspector({ it }: { it: StoryItem }) {
  const p = it.p;
  const rows = [
    p.role && { k: "Role", v: p.role },
    p.years && { k: "When", v: p.years },
    p.stack && { k: "Built with", v: p.stack },
    it.status && { k: "Status", v: it.status },
    ...p.numbers.map((n) => ({ k: n.label, v: n.value })),
  ].filter((x): x is { k: string; v: string } => !!x);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {it.app && <AppIcon id={it.app} size={48} />}
        <div className="min-w-0">
          <div className="t-headline truncate text-ink">{p.name}</div>
          <div className="t-foot truncate text-ink-2">{it.eyebrow}</div>
        </div>
      </div>
      {p.what && <p className="t-sub text-ink-2">{p.what}</p>}
      <InfoGrid rows={rows} cols={1} />
      {p.link && (
        <Btn variant="tinted" capsule href={p.link.href} icon={<ArrowUpRight size={14} />} className="w-full">
          {p.link.href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </Btn>
      )}
    </div>
  );
}

function LiveSite({ it }: { it: StoryItem }) {
  const { compact } = useChrome();
  const href = it.p.link!.href;
  const domain = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [info, setInfo] = useState(!compact);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  // on the phone a site that never loads (blocked from framing) falls back to its story; on the desktop the
  // browser says so itself and offers a new tab
  useEffect(() => {
    if (!compact) return;
    setLoaded(false);
    const t = window.setTimeout(() => setFailed((f) => f || !loadedRef.current), 9000);
    return () => window.clearTimeout(t);
  }, [reload, compact]);
  const loadedRef = useRef(false);
  // when the window gets too narrow for both, the site keeps the room and Info waits behind its button
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || compact) return;
    let was = el.clientWidth < 700;
    if (was) setInfo(false);
    const ro = new ResizeObserver(() => {
      const narrow = el.clientWidth < 700;
      if (narrow && !was) setInfo(false);
      was = narrow;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, failed]);
  if (failed)
    return (
      <div className="h-full overflow-y-auto bg-[var(--bg)]">
        <Story it={it} standalone />
      </div>
    );
  const frame = (
    <div className="relative min-h-0 flex-1 bg-[var(--bg)]">
      {!loaded && (
        <div className="absolute inset-0 space-y-3 p-8" aria-hidden>
          <div className="skeleton h-8 w-1/3 rounded-[10px]" />
          <div className="skeleton h-48 w-full rounded-[20px]" />
          <div className="skeleton h-4 w-2/3 rounded-[6px]" />
          <div className="skeleton h-4 w-1/2 rounded-[6px]" />
        </div>
      )}
      <iframe
        key={reload}
        src={href}
        title={it.p.name}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => {
          loadedRef.current = true;
          setLoaded(true);
        }}
        className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
  if (compact)
    return (
      <div className="fixed inset-x-0 bottom-0 top-[calc(var(--phone-top)+52px)] flex flex-col">
        {/* a navigation row of its own, so the close button never sits on the site's header */}
        <div className="t-headline absolute inset-x-[68px] -top-12 flex h-11 items-center justify-center truncate text-ink">{it.p.name}</div>
        {frame}
        <div data-glass="" className={`${glass("pop")} absolute inset-x-3 bottom-[calc(var(--phone-bottom)+2px)] flex h-12 items-center gap-1 rounded-[20px] px-1.5`}>
          <Btn variant="plain" size="md" iconOnly label="Info" onClick={() => setInfo(true)} icon={<Info size={18} />} />
          <span className="t-sub min-w-0 flex-1 truncate text-center font-medium text-ink">{domain}</span>
          <Btn variant="plain" size="md" iconOnly label="Open in Safari" href={href} icon={<ArrowUpRight size={18} />} />
        </div>
        <AnimatePresence>
          {info && (
            <>
              <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setInfo(false)} className="fixed inset-0 z-[50] bg-black/25" />
              <motion.div
                key="sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.42 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                onDragEnd={(_, i) => (i.offset.y > 90 || i.velocity.y > 600) && setInfo(false)}
                className="sq-panel fixed inset-x-0 bottom-0 z-[51] max-h-[75%] overflow-auto rounded-t-[28px] bg-[var(--bg-elevated)] px-5 pb-[calc(var(--phone-bottom)-10px)] pt-3"
              >
                <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-[var(--fill)]" />
                <Inspector it={it} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  // on the desktop the site opens in a small browser: its own address, back and forward, anywhere it links to
  return (
    <div ref={root} className="h-full min-h-0">
      <Browser
        start={href}
        title={it.p.name}
        lead={it.app ? <AppIcon id={it.app} size={16} flat /> : undefined}
        end={<Btn variant={info ? "tinted" : "plain"} size="sm" iconOnly label="Info" onClick={() => setInfo((v) => !v)} icon={<Info size={15} />} />}
        side={
          <AnimatePresence initial={false}>
            {info && (
              <motion.aside
                key="inspector"
                initial={{ x: 280, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 280, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.36 }}
                className="inspector w-[272px] shrink-0 overflow-auto p-5 @max-[699px]/site:absolute @max-[699px]/site:inset-y-0 @max-[699px]/site:right-0 @max-[699px]/site:z-10 @max-[699px]/site:max-w-[calc(100%-16px)] @max-[699px]/site:shadow-[var(--shadow-3)]"
              >
                <Inspector it={it} />
              </motion.aside>
            )}
          </AnimatePresence>
        }
      />
    </div>
  );
}
