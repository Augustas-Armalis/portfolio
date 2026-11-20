"use client";

// Projects: one App Store-style page per project. Its icon and name with the big button (Get, Open or Visit), the
// figures, a film and pictures, the story in his words, the files of a public repository and the facts.

import { ArrowUpRight, FileText } from "lucide-react";
import { Sym } from "../symbols";
import { useEffect, useState } from "react";
import { projectGroups, projects, type AppId, type Project } from "@/content";
import { useOS } from "@/store";
import { AppIcon } from "../icons";
import { Btn, dragFile, InfoGrid, List, ListRow, QuickLook, SectionHeader, StatsRow, useChrome } from "../ui";

// GitHub and the like refuse to be shown inside a page, and a phone has its own browser: those open in a new tab.
// Everything else opens in the OS's own Browser.
export function useOpenLink() {
  const openUrl = useOS((s) => s.openUrl);
  return (href: string) => (/github\.com|x\.com|youtube\.com|spotify\.com|linkedin\.com/.test(href) ? window.open(href, "_blank", "noopener") : openUrl(href));
}

const eyebrowOf = (id: AppId, p: Project) => {
  const g = projectGroups.find((x) => x.apps.includes(id))?.id;
  if (g === "now") return "Working on now";
  if (g === "lab") return "From the Lab";
  return p.status === "Closed" ? "Venture, closed" : "Venture";
};
const isTall = (src: string) => /phone/.test(src);

function ProductPage({ id, p }: { id: AppId; p: Project }) {
  const { compact } = useChrome();
  const openLink = useOpenLink();
  const pics = [p.image, ...(p.images ?? [])].filter((x): x is string => !!x);
  const [look, setLook] = useState<number | null>(null);
  const stats = [
    ...p.numbers.map((n) => ({ k: n.label, v: n.value })),
    ...(p.status && !p.numbers.some((n) => n.label === "Status") ? [{ k: "Status", v: p.status }] : []),
  ].slice(0, 4);
  const info = [
    p.role && { k: "Role", v: p.role },
    p.years && { k: "When", v: p.years },
    p.stack && { k: "Built with", v: p.stack },
    p.status && { k: "Status", v: p.status },
    p.link && { k: "Website", v: p.link.label },
  ].filter((x): x is { k: string; v: string } => !!x);
  const pad = compact ? "px-5" : "px-10 @max-[559px]:px-6";
  return (
    <article className="@container pb-12">
      {/* the head: the window's drag area on the desktop, under the status bar and Close row on a phone */}
      <header data-drag={compact ? undefined : ""} className={`${pad} flex items-center gap-5 ${compact ? "pt-[calc(var(--phone-top)+60px)]" : "pt-[52px]"} pb-6 @max-[459px]:gap-4`}>
        <AppIcon id={id} size={compact ? 92 : 118} />
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-[var(--label-3)]">{eyebrowOf(id, p)}</div>
          <h1 className={`mt-0.5 font-bold leading-[1.1] tracking-[-0.025em] text-ink [text-wrap:balance] ${compact ? "text-[24px]" : "text-[30px]"}`}>{p.name}</h1>
          {p.what && <p className={`mt-1 text-[var(--label-2)] [text-wrap:pretty] ${compact ? "t-sub" : "t-body"}`}>{p.what}</p>}
          {p.get && (
            <div className="mt-3 flex items-center gap-3">
              <Btn variant="prominent" capsule onClick={() => openLink(p.get!.href)} className="!min-w-[76px] !px-5 !text-[15px] !font-bold">
                {p.get.label}
              </Btn>
              {p.get.sub && <span className="t-cap leading-tight text-[var(--label-3)]">{p.get.sub}</span>}
            </div>
          )}
        </div>
      </header>
      {stats.length > 0 && (
        <div className={`${pad} border-y border-[var(--separator)] py-4`}>
          <StatsRow stats={stats} />
        </div>
      )}
      {(p.video || pics.length > 0) && (
        <section className="pt-7">
          <div className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] ${compact ? "scroll-px-5 px-5" : "scroll-px-10 px-10 @max-[559px]:scroll-px-6 @max-[559px]:px-6"}`}>
            {p.video && (
              <div className={`sq-card relative shrink-0 snap-start overflow-hidden rounded-[18px] bg-black shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${compact ? "w-[86%]" : "w-[min(600px,80%)]"}`} data-sq="">
                <video src={p.video.src} poster={p.video.poster} controls playsInline muted loop preload="none" className="block aspect-[720/497] w-full object-cover" aria-label={`${p.name}, a film of it working`} />
              </div>
            )}
            {pics.map((src, i) => (
              <button
                type="button"
                key={src}
                onClick={() => setLook(i)}
                aria-label={`${p.name}, picture ${i + 1}`}
                className={`press lift sq-card shrink-0 snap-start overflow-hidden rounded-[18px] bg-[var(--fill-2)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${isTall(src) ? (compact ? "w-[44%]" : "w-[min(220px,34%)]") : compact ? "w-[86%]" : "w-[min(600px,80%)]"}`}
                data-sq=""
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading={i ? "lazy" : "eager"} decoding="async" {...dragFile(`${p.name} ${i + 1}`, src)} className={`block w-full object-cover object-top ${isTall(src) ? "aspect-[390/844]" : src.includes("contles") ? "aspect-[4/3]" : "aspect-[16/10]"}`} />
              </button>
            ))}
          </div>
        </section>
      )}
      {p.story && (
        <section className={`${pad} pt-7`}>
          <div className="max-w-[64ch] space-y-3.5">
            {p.story.map((t, i) => (
              <p key={i} className={`text-ink [text-wrap:pretty] ${i === 0 ? "t-body" : "t-body text-[var(--label-2)]"}`}>
                {t}
              </p>
            ))}
          </div>
        </section>
      )}
      {p.repo && <RepoFiles repo={p.repo} />}
      {info.length > 0 && (
        <section className={`${pad} pt-8`}>
          <h2 className="mb-1 text-[20px] font-bold tracking-[-0.02em] text-ink">Information</h2>
          <InfoGrid rows={info} cols={compact ? 1 : 2} />
          {p.link && (
            <button type="button" onClick={() => openLink(p.link!.href)} className="press t-body mt-3 inline-flex items-center gap-1 text-[var(--accent-text)]">
              {p.link.label}
              <Sym icon={ArrowUpRight} size={15} weight="medium" />
            </button>
          )}
          {p.footnote && <p className="t-foot mt-4 text-[var(--label-3)]">{p.footnote}</p>}
        </section>
      )}
      <QuickLook items={pics.map((src, i) => ({ title: `${p.name} ${i + 1}`, src }))} index={look} onIndex={setLook} onClose={() => setLook(null)} />
    </article>
  );
}

export function ProjectApp({ id }: { id: AppId }) {
  const p = projects[id];
  if (!p) return null;
  return (
    <div className="h-full overflow-y-auto bg-[var(--bg)]">
      <ProductPage id={id} p={p} />
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


// The files at the top of a public repository, read from GitHub when the page opens. Nothing is made up: if GitHub
// doesn't answer, the page says so and points to it.
function RepoFiles({ repo }: { repo: string }) {
  const { compact } = useChrome();
  const slug = repo.replace(/^https?:\/\/github\.com\//, "");
  const [data, setData] = useState<RepoData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false;
    loadRepo(slug)
      .then((d) => !dead && setData(d))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [slug]);
  return (
    <section className={`${compact ? "px-5" : "px-10 @max-[559px]:px-6"} pt-8`}>
      <SectionHeader mac={!compact}>{`Files on GitHub, ${slug}`}</SectionHeader>
      <List mac={!compact}>
        {data ? (
          data.files.map((f) => (
            <ListRow
              key={f.name}
              mac={!compact}
              href={`${repo}/${f.dir ? "tree" : "blob"}/HEAD/${f.name}`}
              icon={<span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--accent-text)]">{f.dir ? <Sym icon="folder" size={16} fill /> : <Sym icon={FileText} size={16} className="text-ink-2" />}</span>}
              title={<span className="font-mono text-[12.5px]">{f.name}</span>}
              chevron={compact}
            />
          ))
        ) : failed ? (
          <div className={`p-4 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>GitHub didn&apos;t answer. The files are one tap away on GitHub.</div>
        ) : (
          <div className="space-y-2.5 p-4" aria-label="Loading files from GitHub" role="status">
            {[52, 38, 64, 44].map((w) => (
              <div key={w} className="skeleton h-4 rounded-[6px]" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
      </List>
    </section>
  );
}
