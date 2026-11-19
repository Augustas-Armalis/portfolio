"use client";

import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import {
  Aperture,
  ArrowDownUp,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  Download,
  FileText,
  Folder,
  Gamepad2,
  Gauge,
  Github,
  Image as ImageIcon,
  Info,
  Instagram,
  Lock,
  RotateCw,
  Linkedin,
  Mail,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Send,
  ListOrdered,
  Skull,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Undo2,
  Users,
  Volume1,
  Volume2,
  Wallpaper,
  Contrast,
  Palette,
  X,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  apps,
  art,
  bookCall,
  CONTACT_EMAIL,
  CONTACTS,
  contactList,
  desktopItems,
  type Channel,
  allApps,
  novel,
  owner,
  places,
  projectApps,
  projectGroups,
  shots,
  spec,
  taste,
  tracks,
  projects,
  wallpapers,
  type AppId,
  type FinderItem,
  type PlaceId,
  type Project,
} from "@/content";
import { getAnalyser, note, tapMediaElement } from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";
import MusicShader from "./scene/MusicShader";
import dynamic from "next/dynamic";
import { Bars, DeskArt, Resume } from "./Desktop";
import { Monogram } from "./Login";
import { useOS } from "@/store";
import { QUALITY_LABELS, setQualityChoice, useQuality, useQualityChoice, type QualityChoice } from "@/lib/quality";
import { AppIcon, DocArt, FolderArt } from "./icons";
import { Badge, Btn, Button, dragFile, glass, GlassMenu, TabBar, Group, IconTile, InfoGrid, List, ListRow, SectionHeader, Squircle, StatsRow, useContextMenu, QuickLook, Row, SearchField, Segmented, SplitView, Switch, Toolbar, Visual, useChrome, type LookItem } from "./ui";

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{children}</div>
);

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[12px] bg-[#F7F7F9] px-4 py-3.5">
      <div className="text-[22px] font-medium tabular-nums tracking-[-0.02em] text-ink">{value}</div>
      <div className="mt-0.5 text-[12px] text-ink-2">{label}</div>
    </div>
  );
}

function Empty({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#F1F1F4] text-ink-3">{icon}</div>
      <div className="mt-1 text-[14px] font-semibold text-ink">{title}</div>
      <div className="max-w-[32ch] text-[12px] leading-relaxed text-ink-2">{body}</div>
    </div>
  );
}

// ---------- App Store "Today": story cards that open into full stories ----------

type StoryItem = { key: string; p: Project; app?: AppId; eyebrow: string; status?: string; action?: { label: string; run: () => void } };

// Real imagery for projects without a screenshot of their own: one of the OS wallpapers, with the app's icon on it
const STORY_ART: Record<string, string> = {
  lunor: "/wallpapers/founder-foggy-sunrise.jpg",
  contles: "/wallpapers/founder-farnaz-kohankhaki.jpg",
  filzy: "/wallpapers/art-bernd-dittrich.jpg",
  rug: "/wallpapers/founder-mountain-glow.jpg",
  slideskipper: "/wallpapers/art-thom-milkovic.jpg",
  musicengine: "/wallpapers/art-tinky-rain-blue.jpg",
  reel: "/wallpapers/art-satyajit-rain.jpg",
  openwhip: "/wallpapers/founder-mountain-sunset.jpg",
  doom: "/wallpapers/founder-uran-wang.jpg",
};
// screenshots whose lower part is empty page: show only the top share
const CROP: Record<string, number> = { "/img/work-kaching.jpg": 0.6 };
function ShotImg({ src, alt, className = "", ...rest }: { src: string; alt: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const crop = CROP[src];
  return (
    <div className={`overflow-hidden ${className}`} style={{ aspectRatio: crop ? `16 / ${10 * crop}` : "16 / 10" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} {...rest} className={crop ? "block h-auto w-full" : "block h-full w-full object-cover object-top"} />
    </div>
  );
}
const storyImage = (it: StoryItem) => it.p.image ?? STORY_ART[it.key] ?? "/wallpapers/founder-uran-wang.jpg";
// a screenshot of a light UI needs a deeper scrim than a photo
const isShot = (it: StoryItem) => !!it.p.image;

function useToday() {
  const [d, setD] = useState("");
  useEffect(() => setD(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()), []);
  return d;
}

// Behind a screenshot: a wallpaper photo, so the title sits on picture, not on UI text
const SHOT_BG: Record<string, string> = {
  sellify: "/wallpapers/founder-mountain-glow.jpg",
  kaching: "/wallpapers/art-tinky-rain-blue.jpg",
  larpo: "/wallpapers/founder-uran-wang.jpg",
  capto: "/wallpapers/founder-mountain-sunset.jpg",
};

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
        <img src={shot ? SHOT_BG[it.key] ?? "/wallpapers/engineer-pawel-structure.jpg" : storyImage(it)} alt="" draggable={false} className="h-full w-full object-cover" />
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.42)_0%,rgb(0_0_0/0.08)_38%,rgb(0_0_0/0)_55%,rgb(0_0_0/0.5)_100%)]" />
      {shot && (
        <div className={`absolute inset-x-0 bottom-0 flex justify-center ${CROP[storyImage(it)] ? "items-center pb-[6%]" : "items-start"} ${open ? (compact ? "top-[40%]" : "top-[190px]") : "top-[38%]"}`}>
          <Squircle radius={12} className="w-[84%] overflow-hidden shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7),0_0_0_0.5px_rgb(255_255_255/0.2)]">
            <ShotImg src={storyImage(it)} alt="" draggable={false} />
          </Squircle>
        </div>
      )}
      {/* in a window the headline starts under the traffic lights */}
      <motion.div layoutId={`head-${it.key}`} className={`absolute inset-x-0 top-0 ${pad} ${open ? (compact ? "pt-[calc(env(safe-area-inset-top)+64px)]" : "pt-[56px]") : ""}`}>
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
  const pad = compact ? "px-5" : "px-10";
  return (
    <article className="bg-white pb-12">
      <div data-drag={standalone && !compact ? "" : undefined} className={`relative w-full overflow-hidden ${compact ? "aspect-[4/5]" : "h-[420px]"}`}>
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
                className={`press lift sq-card shrink-0 snap-start overflow-hidden rounded-[14px] shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${compact ? "w-[82%]" : "w-[min(520px,70%)]"}`}
                data-sq=""
              >
                <ShotImg src={src} alt={`${p.name} ${i + 1}`} {...dragFile(`${p.name} ${i + 1}.jpg`, src)} />
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

type Photo = { title: string; src: string };
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
                {...dragFile(`${ph.title}.jpg`, ph.src)}
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

function Shots() {
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

function Taste() {
  const [sel, setSel] = useState("rules");
  const title = sel === "rules" ? "Rules" : "Designers I rate";
  const detail =
    sel === "rules" ? (
      // a short manifesto: big type, numbered, one rule a line
      <ol className="px-6 pb-6">
        {taste.rules.map((r, i) => (
          <li key={r} className={`flex items-baseline gap-4 py-[15px] ${i ? "shadow-[inset_0_0.5px_0_var(--separator-opaque)]" : ""}`}>
            <span className="w-5 shrink-0 text-[13px] font-semibold tabular-nums text-ink-3">{String(i + 1).padStart(2, "0")}</span>
            <span className="t-title3 text-ink [text-wrap:balance]">{r}</span>
          </li>
        ))}
      </ol>
    ) : (
      <div className="px-5 pb-6 pt-1">
        <List mac>
          {taste.rated.map((d) => (
            <ListRow
              mac
              key={d}
              icon={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#B4B9C4] to-[#868B96] text-[12px] font-semibold text-white">{d[0].toUpperCase()}</span>
              }
              title={d}
            />
          ))}
        </List>
      </div>
    );
  return (
    <SplitView
      selected={sel}
      onSelect={setSel}
      sections={[
        {
          title: "Taste",
          items: [
            { id: "rules", label: "Rules", icon: <ListOrdered size={15} />, meta: <span className="text-[11px] tabular-nums text-ink-3">{taste.rules.length}</span> },
            { id: "rated", label: "Designers I rate", icon: <Star size={15} />, meta: <span className="text-[11px] tabular-nums text-ink-3">{taste.rated.length}</span> },
          ],
        },
      ]}
      detail={
        <div className="flex min-h-full flex-col">
          <Toolbar title={title} />
          <div className="flex flex-1 flex-col">{detail}</div>
        </div>
      }
    />
  );
}

function Kit() {
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  const [val, setVal] = useState(40);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F7F9]">
      <Toolbar title="Kit" sub="Live components" />
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <Group title="Controls">
          <Row label="Switch">
            <Switch on={on} onChange={setOn} label="Example switch" />
          </Row>
          <Row label="Segmented">
            <Segmented
              id="kit"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "day", label: "Day" },
                { value: "week", label: "Week" },
                { value: "month", label: "Month" },
              ]}
            />
          </Row>
          <Row label="Slider" sub={`${val}%`}>
            <input id="kit-slider" type="range" aria-label="Example slider" min={0} max={100} value={val} onChange={(e) => setVal(+e.target.value)} className="scrub scrub-accent w-36" style={{ ["--p" as string]: `${val}%` }} />
          </Row>
        </Group>
        <Group title="Buttons">
          <Row label="Secondary and primary">
            <div className="flex gap-2">
              <Button size="sm">Cancel</Button>
              <Button size="sm" variant="primary">
                Save
              </Button>
            </div>
          </Row>
        </Group>
      </div>
    </div>
  );
}

// ---------- Founder and Lab: one app per endeavour ----------

function ProjectApp({ id }: { id: AppId }) {
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
function repoFiles(p: Project): { name: string; dir?: boolean; note: string }[] {
  const st = (p.stack ?? "").toLowerCase();
  const tail = [
    { name: "README.md", note: "What it is and how to run it" },
    { name: "LICENSE", note: "Licence" },
  ];
  if (st.includes("swift")) return [{ name: "Sources", dir: true, note: "The app" }, { name: "Resources", dir: true, note: "Assets" }, { name: "Package.swift", note: "Swift package manifest" }, ...tail];
  if (st.includes("python")) return [{ name: "engine", dir: true, note: "The package" }, { name: "scores", dir: true, note: "Studied scores" }, { name: "tests", dir: true, note: "Rule checks" }, { name: "pyproject.toml", note: "Project and dependencies" }, ...tail];
  if (st.includes("electron")) return [{ name: "src", dir: true, note: "Main and renderer" }, { name: "assets", dir: true, note: "Tray icons" }, { name: "package.json", note: "Scripts and dependencies" }, ...tail];
  return [{ name: "src", dir: true, note: "Source" }, { name: "package.json", note: "Scripts and dependencies" }, { name: "tsconfig.json", note: "TypeScript settings" }, ...tail];
}

function RepoView({ it }: { it: StoryItem }) {
  const { compact } = useChrome();
  const p = it.p;
  const files = repoFiles(p);
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
      <div className={`min-h-0 flex-1 overflow-auto ${compact ? "px-4 pb-10" : "px-6 pb-8 pt-1"}`}>
        <div className="flex items-center gap-4">
          {it.app && <AppIcon id={it.app} size={compact ? 60 : 64} />}
          <div className="min-w-0 flex-1">
            <h1 className={compact ? "t-title2 text-ink" : "m-large text-ink"}>{p.name}</h1>
            {p.what && <p className={`mt-0.5 text-ink-2 [text-wrap:pretty] ${compact ? "t-sub" : "m-body"}`}>{p.what}</p>}
          </div>
        </div>
        {compact && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        <div className={`mt-5 grid gap-5 ${compact ? "" : "grid-cols-[minmax(0,1fr)_220px]"}`}>
          <div className="min-w-0 space-y-5">
            <div>
              <SectionHeader mac={!compact}>Files</SectionHeader>
              <List mac={!compact}>
                {files.map((f) => (
                  <ListRow
                    key={f.name}
                    mac={!compact}
                    icon={<span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--accent)]">{f.dir ? <Folder size={16} fill="currentColor" fillOpacity={0.18} /> : <FileText size={15} className="text-ink-2" />}</span>}
                    title={<span className="font-mono text-[12.5px]">{f.name}</span>}
                    detail={<span className={compact ? "t-foot" : "m-sub"}>{f.note}</span>}
                  />
                ))}
              </List>
            </div>
            <div>
              <SectionHeader mac={!compact}>README.md</SectionHeader>
              <List mac={!compact} className="p-5">
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
  // a site that never loads (blocked from framing) falls back to its story
  useEffect(() => {
    setLoaded(false);
    const t = window.setTimeout(() => setFailed((f) => f || !loadedRef.current), 9000);
    return () => window.clearTimeout(t);
  }, [reload]);
  const loadedRef = useRef(false);
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
          <div className="skeleton h-8 w-1/3 rounded-[8px]" />
          <div className="skeleton h-48 w-full rounded-[16px]" />
          <div className="skeleton h-4 w-2/3 rounded-[4px]" />
          <div className="skeleton h-4 w-1/2 rounded-[4px]" />
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
      <div className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+108px)] flex flex-col">
        {/* a navigation row of its own, so the close button never sits on the site's header */}
        <div className="t-headline absolute inset-x-16 -top-[50px] flex h-11 items-center justify-center truncate text-ink">{it.p.name}</div>
        {frame}
        <div data-glass="" className={`${glass("pop")} absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+36px)] flex h-12 items-center gap-1 rounded-[16px] px-1.5`}>
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
                className="sq-panel fixed inset-x-0 bottom-0 z-[51] max-h-[75%] overflow-auto rounded-t-[24px] bg-[var(--bg-elevated)] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3"
              >
                <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-[var(--fill)]" />
                <Inspector it={it} />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-drag className="toolbar flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--separator)] pl-[84px] pr-3">
        <Btn variant="plain" size="sm" iconOnly label="Reload" onClick={() => setReload((r) => r + 1)} icon={<RotateCw size={14} />} />
        <div className="search mx-auto flex h-[30px] w-[min(420px,60%)] items-center justify-center gap-1.5 rounded-[8px] bg-[var(--fill-2)] px-3">
          <Lock size={11} className="text-ink-2" />
          <span className="m-body truncate font-medium text-ink">{domain}</span>
        </div>
        <Btn variant="plain" size="sm" iconOnly label="Open in a new tab" href={href} icon={<ArrowUpRight size={15} />} />
        <Btn variant={info ? "tinted" : "plain"} size="sm" iconOnly label="Info" onClick={() => setInfo((v) => !v)} icon={<Info size={15} />} />
      </div>
      <div className="flex min-h-0 flex-1">
        {frame}
        <AnimatePresence initial={false}>
          {info && (
            <motion.aside
              key="inspector"
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.36 }}
              className="inspector w-[272px] shrink-0 overflow-auto p-5"
            >
              <Inspector it={it} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Shareware DOOM in js-dos, loaded only when the app opens.
// js-dos ships a Tailwind 3 + daisyUI stylesheet: global resets (*, ::before { --tw-translate-x: 0 }) and class
// names this OS also uses (.btn, .glass). Loaded as is, it un-centred the Dock and restyled every button the
// moment DOOM started. So its rules are confined to the player: scoped to .jsdos-host and put in the lowest
// cascade layer (declared first in globals.css). Keyframes and fonts can't live in a scope, so they stay outside.
function scopeCss(css: string, root: string) {
  const outside: string[] = [];
  const inside: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const rule = css.slice(start, i + 1);
        (/^\s*@(-webkit-)?(keyframes|font-face|property)/.test(rule) ? outside : inside).push(rule);
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) start = i + 1;
  }
  return `${outside.join("")}@layer jsdos{@scope (${root}){${inside.join("").replace(/:root/g, ":scope")}}}`;
}
let dosLoad: Promise<void> | null = null;
function loadDos() {
  if (dosLoad) return dosLoad;
  const style = document.createElement("style");
  document.head.appendChild(style);
  const css =
    typeof CSSScopeRule === "undefined"
      ? Promise.reject(new Error("no @scope"))
      : fetch("/doom/js-dos.css")
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error("css"))))
          .then((t) => void (style.textContent = scopeCss(t, ".jsdos-host")));
  dosLoad = css
    // an older browser: the layer alone still keeps the resets under the OS's own styles
    .catch(() => void (style.textContent = '@import url("/doom/js-dos.css") layer(jsdos);'))
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          const js = document.createElement("script");
          js.src = "/doom/js-dos.js";
          js.onload = () => resolve();
          js.onerror = () => reject(new Error("js-dos failed to load"));
          document.head.appendChild(js);
        }),
    );
  return dosLoad;
}

type DosCi = { sendKeyEvent: (code: number, pressed: boolean) => void };
// js-dos key codes
const DK = { up: 265, down: 264, left: 263, right: 262, fire: 341, use: 32, enter: 257, esc: 256, yes: 89 };

function Doom() {
  const { compact } = useChrome();
  const ref = useRef<HTMLDivElement>(null);
  const ci = useRef<DosCi | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started) return;
    let props: { stop?: () => unknown } | null = null;
    let dead = false;
    setState("loading");
    loadDos()
      .then(() => {
        if (dead || !ref.current) return;
        const Dos = (window as unknown as { Dos: (el: HTMLElement, o: Record<string, unknown>) => { stop?: () => unknown } }).Dos;
        props = Dos(ref.current, {
          url: "/doom/doom-shareware.jsdos",
          pathPrefix: "/doom/emulators/",
          autoStart: true,
          kiosk: true,
          noCloud: true,
          noNetworking: true,
          theme: "dark",
          // a phone has no mouse to capture; it plays from the buttons below the screen
          ...(compact ? { mouseCapture: false } : {}),
          onEvent: (e: string, c: unknown) => {
            if (e === "ci-ready") ci.current = c as DosCi;
          },
        });
        setState("idle");
      })
      .catch(() => setState("error"));
    return () => {
      dead = true;
      ci.current = null;
      try {
        props?.stop?.();
      } catch {}
    };
  }, [started, compact]);

  // a touch button holds a DOS key down for as long as the finger is on it
  const hold = (code: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      ci.current?.sendKeyEvent(code, true);
    },
    onPointerUp: () => ci.current?.sendKeyEvent(code, false),
    onPointerCancel: () => ci.current?.sendKeyEvent(code, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const pad = `${glass("btn-dark")} glass-press no-callout flex touch-none select-none items-center justify-center rounded-full text-white/90`;

  const card = !started && (
    // a title card: the icon, the name in heavy type, the episode, one clear button and how it is played
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(70%_60%_at_50%_42%,#3a0d08_0%,#120403_55%,#000_100%)] px-6 text-center">
      <AppIcon id="doom" size={88} />
      <div className="mt-6 text-[44px] font-black leading-none tracking-[0.08em] text-white">DOOM</div>
      <div className="t-sub mt-2 text-white/60">Episode 1 · Knee-Deep in the Dead</div>
      <div className="mt-6">
        <Btn variant="prominent" capsule size="lg" onClick={() => setStarted(true)} icon={<Play size={16} fill="currentColor" />} className="!h-11 !bg-[#e0412f] !px-7 !text-[16px]">
          Play
        </Btn>
      </div>
      {compact ? (
        <div className="t-foot mt-6 max-w-[260px] text-white/45">Shareware v1.9. Plays with the buttons under the screen; a keyboard is better.</div>
      ) : (
        <div className="m-sub mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-white/45">
          {[
            ["Arrows", "move"],
            ["Ctrl", "fire"],
            ["Space", "open"],
          ].map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <kbd className="rounded-[5px] bg-white/10 px-1.5 py-0.5 font-sans text-white/75 shadow-[inset_0_0_0_0.5px_rgb(255_255_255/0.18)]">{k}</kbd>
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
  const status = (
    <>
      {state === "loading" && <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-white/50">Loading…</div>}
      {state === "error" && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/70">DOOM couldn&apos;t load.</div>}
    </>
  );

  if (compact)
    return (
      <div className="on-dark fixed inset-0 flex flex-col bg-black pt-[calc(env(safe-area-inset-top)+110px)]">
        {/* the screen: 4:3 like the original, full width */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black">
          <div ref={ref} className="jsdos-host absolute inset-0" />
          {status}
        </div>
        {started && (
          <div className="relative flex min-h-0 flex-1 flex-col justify-end px-5 pb-[calc(env(safe-area-inset-bottom)+48px)]">
            <div className="mb-auto flex justify-center gap-2 pt-4">
              {(
                [
                  ["Menu", DK.esc],
                  ["Enter", DK.enter],
                  ["Yes", DK.yes],
                ] as const
              ).map(([l, c]) => (
                <button type="button" key={l} data-glass="" {...hold(c)} className={`${pad} h-10 px-4 text-[14px] font-semibold`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-end justify-between">
              <div className="grid grid-cols-3 grid-rows-3 gap-1" role="group" aria-label="Move">
                <button type="button" aria-label="Forward" data-glass="" {...hold(DK.up)} className={`${pad} col-start-2 h-[54px] w-[54px]`}>
                  <ChevronLeft size={26} className="rotate-90" />
                </button>
                <button type="button" aria-label="Turn left" data-glass="" {...hold(DK.left)} className={`${pad} col-start-1 row-start-2 h-[54px] w-[54px]`}>
                  <ChevronLeft size={26} />
                </button>
                <button type="button" aria-label="Turn right" data-glass="" {...hold(DK.right)} className={`${pad} col-start-3 row-start-2 h-[54px] w-[54px]`}>
                  <ChevronRight size={26} />
                </button>
                <button type="button" aria-label="Back" data-glass="" {...hold(DK.down)} className={`${pad} col-start-2 row-start-3 h-[54px] w-[54px]`}>
                  <ChevronLeft size={26} className="-rotate-90" />
                </button>
              </div>
              <div className="flex items-end gap-3">
                <button type="button" data-glass="" {...hold(DK.use)} className={`${pad} h-[60px] w-[60px] text-[14px] font-semibold`}>
                  Open
                </button>
                <button type="button" data-glass="" {...hold(DK.fire)} className={`${pad} mb-8 h-[84px] w-[84px] !bg-[#e0412f]/70 text-[16px] font-bold`}>
                  Fire
                </button>
              </div>
            </div>
          </div>
        )}
        {card}
      </div>
    );

  return (
    <div className="on-dark relative flex h-full min-h-[320px] flex-col bg-black">
      <Toolbar title={<span className="text-white/85">DOOM</span>} sub={<span className="text-white/40">Shareware v1.9</span>} />
      <div className="relative min-h-[280px] flex-1">
        <div ref={ref} className="jsdos-host absolute inset-0" />
        {card}
        {status}
      </div>
    </div>
  );
}

// ---------- Art ----------

const KEYS = "awsedftgyhujkolp;'".split("");
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const noteName = (m: number) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

function PianoApp() {
  const { compact } = useChrome();
  const setPlaying = useOS((s) => s.setPlaying);
  const [downs, setDowns] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const [oct, setOct] = useState<"3" | "4" | "5">("4");
  const timer = useRef<number | undefined>(undefined);
  // the phone shows one octave at a size a thumb can play, with the octave on a switch; the Mac shows two
  const base = compact ? 12 * (Number(oct) + 1) : 60;
  const notes = Array.from({ length: compact ? 13 : 25 }, (_, i) => base + i);
  const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
  const whites = notes.filter((m) => !isBlack(m));

  // real sampled piano (Salamander); the synth only covers a note whose sample can't play
  useEffect(() => preloadPiano(base, base + 24), [base]);
  const hit = (m: number) => {
    if (useOS.getState().sound && !playPiano(m, { vel: 0.7, dur: 2.4 })) note(m);
    setLast(m);
    setPlaying("Piano");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPlaying(null), 1800);
  };

  // every finger (or the mouse) holds one key; sliding onto another key plays it, so a glissando works
  const held = useRef(new Map<number | string, number>());
  const sync = () => setDowns([...held.current.values()]);
  const press = (who: number | string, m: number) => {
    if (held.current.get(who) === m) return;
    held.current.set(who, m);
    hit(m);
    sync();
  };
  const release = (who: number | string) => {
    if (held.current.delete(who)) sync();
  };
  const keyAt = (e: React.PointerEvent) => {
    const n = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.dataset.note;
    return n ? Number(n) : null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && i < notes.length) press(`k${i}`, base + i);
    };
    const onUp = (e: KeyboardEvent) => {
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0) release(`k${i}`);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  });

  const keyboard = (
    <div
      className="relative flex h-full touch-none select-none gap-[2px]"
      onPointerDown={(e) => {
        try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
        const m = keyAt(e);
        if (m !== null) press(e.pointerId, m);
      }}
      onPointerMove={(e) => {
        if (!held.current.has(e.pointerId)) return;
        const m = keyAt(e);
        if (m !== null) press(e.pointerId, m);
      }}
      onPointerUp={(e) => release(e.pointerId)}
      onPointerCancel={(e) => release(e.pointerId)}
    >
      {whites.map((m) => (
        <button
          type="button"
          key={m}
          data-note={m}
          aria-label={noteName(m)}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && hit(m)}
          className={`piano-white relative h-full flex-1 rounded-b-[7px] ${downs.includes(m) ? "is-down" : ""}`}
        >
          {compact && m % 12 === 0 && <span className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] font-semibold text-black/35">{noteName(m)}</span>}
        </button>
      ))}
      {notes.filter(isBlack).map((m) => {
        const left = whites.filter((w) => w < m).length;
        return (
          <button
            type="button"
            key={m}
            data-note={m}
            aria-label={noteName(m)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && hit(m)}
            className={`piano-black absolute top-0 h-[60%] -translate-x-1/2 rounded-b-[5px] ${downs.includes(m) ? "is-down" : ""}`}
            style={{ left: `${(left / whites.length) * 100}%`, width: `${(100 / whites.length) * 0.6}%` }}
          />
        );
      })}
    </div>
  );

  if (compact)
    return (
      <div className="flex flex-col" style={{ height: "calc(100dvh - env(safe-area-inset-top, 0px) - 160px)" }}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="text-[72px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink" aria-live="polite">
            {last !== null ? noteName(last) : "♪"}
          </div>
          <div className="t-sub mt-3 text-ink-2">{last !== null ? "Slide across the keys" : "Tap a key, or slide across them"}</div>
        </div>
        <div className="flex justify-center pb-4">
          <Segmented
            id="piano-octave"
            value={oct}
            onChange={setOct}
            options={[
              { value: "3", label: "Low" },
              { value: "4", label: "Middle" },
              { value: "5", label: "High" },
            ]}
          />
        </div>
        <div className="mx-2 h-[42%] max-h-[340px] min-h-[220px] shrink-0 rounded-[16px] bg-[#16171A] px-[6px] pb-[6px] pt-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">{keyboard}</div>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="Piano" sub={last !== null ? noteName(last) : "A – ;"} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-[#F7F7F9] p-4">
        <div className="relative min-h-[140px] flex-1 rounded-[12px] bg-[#16171A] px-2 pb-2 pt-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">{keyboard}</div>
      </div>
    </div>
  );
}

// ---------- music player: one <audio> for the whole OS, routed through the analyser ----------

type PlayerState = { id: string | null; playing: boolean; t: number; dur: number };
let media: HTMLAudioElement | null = null;
let pstate: PlayerState = { id: null, playing: false, t: 0, dur: 0 };
const psubs = new Set<() => void>();
const pset = (p: Partial<PlayerState>) => {
  pstate = { ...pstate, ...p };
  psubs.forEach((f) => f());
};
const trackOf = (id: string | null) => tracks.find((t) => t.id === id) ?? null;
function syncNowPlaying() {
  const t = trackOf(pstate.id);
  useOS.getState().setPlaying(pstate.playing && t ? t.title : null);
}
function audioEl() {
  if (media) return media;
  const el = new Audio();
  el.preload = "metadata";
  try {
    tapMediaElement(el);
  } catch {}
  el.muted = !useOS.getState().sound;
  useOS.subscribe((s) => {
    el.muted = !s.sound;
  });
  el.addEventListener("timeupdate", () => pset({ t: el.currentTime }));
  el.addEventListener("loadedmetadata", () => pset({ dur: el.duration }));
  el.addEventListener("play", () => {
    pset({ playing: true });
    syncNowPlaying();
  });
  el.addEventListener("pause", () => {
    pset({ playing: false });
    syncNowPlaying();
  });
  el.addEventListener("ended", () => {
    const i = tracks.findIndex((t) => t.id === pstate.id);
    if (i >= 0 && i < tracks.length - 1) player.play(tracks[i + 1].id);
    else pset({ t: 0 });
  });
  media = el;
  return el;
}
export const player = {
  play(id: string) {
    const el = audioEl();
    const t = trackOf(id);
    if (!t) return;
    void (getAnalyser()?.context as AudioContext | undefined)?.resume();
    if (pstate.id !== id) {
      el.src = t.file;
      pset({ id, t: 0, dur: t.duration });
    }
    void el.play().catch(() => {});
  },
  toggle(id?: string) {
    const el = audioEl();
    const target = id ?? pstate.id ?? tracks[0]?.id;
    if (!target) return;
    if (pstate.id === target && pstate.playing) el.pause();
    else player.play(target);
  },
  seek(sec: number) {
    const el = audioEl();
    el.currentTime = sec;
    pset({ t: sec });
  },
  volume(v: number) {
    audioEl().volume = Math.max(0, Math.min(1, v));
  },
  stop() {
    if (!media) return;
    media.pause();
    pset({ id: null, t: 0, playing: false });
    syncNowPlaying();
  },
};
export function usePlayer() {
  return useSyncExternalStore(
    (f) => {
      psubs.add(f);
      return () => psubs.delete(f);
    },
    () => pstate,
    () => pstate,
  );
}
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------- Music: now playing over the artwork's own colours, a queue beside it ----------

function Scrubber({ dark = true }: { dark?: boolean }) {
  const p = usePlayer();
  const cur = trackOf(p.id);
  const [scrub, setScrub] = useState<number | null>(null);
  const total = p.dur || cur?.duration || tracks[0]?.duration || 0;
  const shown = scrub ?? p.t;
  const commit = () => {
    if (scrub !== null) player.seek(scrub);
    setScrub(null);
  };
  return (
    <div>
      <input
        type="range"
        aria-label="Position"
        min={0}
        max={Math.max(1, total)}
        step={0.1}
        value={Math.min(shown, total || 1)}
        disabled={!cur}
        onChange={(e) => setScrub(+e.target.value)}
        onPointerUp={commit}
        onKeyUp={commit}
        className={`scrub w-full ${dark ? "scrub-light" : ""}`}
        style={{ ["--p" as string]: `${total ? (Math.min(shown, total) / total) * 100 : 0}%` }}
      />
      <div className={`m-sub mt-0.5 flex justify-between tabular-nums ${dark ? "text-white/55" : "text-ink-3"}`}>
        <span>{clock(shown)}</span>
        <span>-{clock(Math.max(0, total - shown))}</span>
      </div>
    </div>
  );
}

function Transport({ size = 1 }: { size?: number }) {
  const p = usePlayer();
  const i = Math.max(0, tracks.findIndex((t) => t.id === p.id));
  const go = (d: number) => player.play(tracks[(i + d + tracks.length) % tracks.length].id);
  return (
    <div className="flex items-center justify-center gap-7 text-white">
      <button type="button" aria-label="Previous" onClick={() => go(-1)} className="press opacity-90 hov:hover:opacity-100">
        <SkipBack size={26 * size} fill="currentColor" />
      </button>
      <button type="button" aria-label={p.playing ? "Pause" : "Play"} onClick={() => player.toggle()} className="press">
        {p.playing ? <Pause size={40 * size} fill="currentColor" /> : <Play size={40 * size} fill="currentColor" />}
      </button>
      <button type="button" aria-label="Next" onClick={() => go(1)} className="press opacity-90 hov:hover:opacity-100">
        <SkipForward size={26 * size} fill="currentColor" />
      </button>
    </div>
  );
}

// The live shader, with a still photo under it: if WebGL is missing or its context is lost, the photo shows
// instead of a blank canvas.
export function LiveWallpaper({ fallback = "/wallpapers/art-bernd-dittrich.jpg", intensity = 1 }: { fallback?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const lost = () => setOk(false);
    let canvas: HTMLCanvasElement | null = null;
    const t = window.setTimeout(() => {
      canvas = root.querySelector("canvas");
      if (!canvas) return setOk(false);
      const gl = (canvas.getContext("webgl") ?? canvas.getContext("webgl2")) as WebGLRenderingContext | null;
      if (!gl || gl.isContextLost()) return setOk(false);
      canvas.addEventListener("webglcontextlost", lost);
    }, 400);
    return () => {
      window.clearTimeout(t);
      canvas?.removeEventListener("webglcontextlost", lost);
    };
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 bg-[#070b16] bg-cover bg-center" style={{ backgroundImage: `url(${fallback})` }}>
      {ok && (
        <div className="absolute inset-0">
          <MusicShader intensity={intensity} palette="night" />
        </div>
      )}
    </div>
  );
}

// the artwork's own colours, blurred, behind everything; the shader joins in while music plays
function MusicBackdrop() {
  const p = usePlayer();
  const lead = trackOf(p.id) ?? tracks[0];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0b0c10]">
      <AnimatePresence initial={false}>
        <motion.div key={lead.cover} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lead.cover} alt="" className="absolute inset-[-20%] h-[140%] w-[140%] object-cover blur-[70px] saturate-[1.7]" />
        </motion.div>
      </AnimatePresence>
      <motion.div className="absolute inset-0 mix-blend-screen" animate={{ opacity: p.playing ? 0.55 : 0 }} transition={{ duration: 0.8 }}>
        {p.playing && <LiveWallpaper fallback={lead.cover} />}
      </motion.div>
      <div className="absolute inset-0 bg-black/40" />
    </div>
  );
}

function NowPlaying({ compact }: { compact: boolean }) {
  const p = usePlayer();
  const lead = trackOf(p.id) ?? tracks[0];
  return (
    <div className="relative flex h-full flex-col overflow-hidden text-white">
      {compact && <MusicBackdrop />}
      <div className={`relative flex flex-1 flex-col ${compact ? "px-7 pb-10 pt-[calc(env(safe-area-inset-top)+70px)]" : "justify-center px-10 py-8"}`}>
        <motion.img
          key={lead.id}
          src={lead.cover}
          alt={lead.title}
          draggable={false}
          animate={{ scale: p.playing || !p.id ? 1 : 0.86 }}
          transition={{ type: "spring", bounce: 0.25, duration: 0.6 }}
          data-sq=""
          className={`mx-auto aspect-square w-full object-cover shadow-[0_30px_60px_-20px_rgb(0_0_0/0.6)] ${compact ? "max-w-[320px] rounded-[14px]" : "max-w-[340px] rounded-[14px]"}`}
        />
        <div className={`mx-auto w-full ${compact ? "mt-9 max-w-[320px]" : "mt-7 max-w-[340px]"}`}>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[20px] font-semibold tracking-[-0.02em]">{lead.title}</div>
              <div className={`truncate text-white/60 ${compact ? "text-[17px]" : "text-[15px]"}`}>{lead.artist}</div>
            </div>
            {!lead.confirmed && <span className="m-sub shrink-0 rounded-[6px] bg-white/15 px-1.5 py-0.5 text-white/80">Unreleased</span>}
          </div>
          <div className="mt-4">
            <Scrubber />
          </div>
          <div className="mt-3">
            <Transport size={compact ? 1 : 0.9} />
          </div>
          <VolumeSlider />
        </div>
      </div>
    </div>
  );
}

function VolumeSlider() {
  const [v, setV] = useState(1);
  return (
    <div className="mt-5 flex items-center gap-2.5 text-white/70">
      <Volume1 size={15} />
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={v}
        onChange={(e) => {
          setV(+e.target.value);
          player.volume(+e.target.value);
        }}
        className="scrub scrub-light min-w-0 flex-1"
        style={{ ["--p" as string]: `${v * 100}%` }}
      />
      <Volume2 size={15} />
    </div>
  );
}

// Up Next on the same surface: large type on a translucent material, the current piece lit
function GlassQueue() {
  const p = usePlayer();
  return (
    <div data-drag className="on-dark relative flex h-full flex-col overflow-auto border-l border-white/10 bg-white/[0.07] px-6 pb-6 pt-[60px] text-white [backdrop-filter:blur(30px)_saturate(1.6)]">
      <div className="eyebrow mb-3 text-white/50">Up Next</div>
      <div className="space-y-1">
        {tracks.map((t) => {
          const on = p.id === t.id;
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => player.toggle(t.id)}
              className={`press group flex w-full items-center gap-3.5 rounded-[14px] p-2.5 text-left transition-colors duration-150 ${on ? "bg-white/[0.14]" : "hov:hover:bg-white/[0.08]"}`}
              data-sq=""
            >
              <span className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.cover} alt="" className="h-14 w-14 rounded-[9px] object-cover shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)]" />
                {on && p.playing && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-[9px] bg-black/45">
                    <Bars light />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[17px] tracking-[-0.02em] ${on ? "font-semibold" : "font-medium text-white/90"}`}>{t.title}</span>
                <span className="block truncate text-[13px] text-white/55">{t.note}</span>
              </span>
              <span className="text-[13px] tabular-nums text-white/50">{t.durationLabel}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-auto pt-8 text-[22px] font-semibold leading-[1.25] tracking-[-0.02em] text-white/35 [text-wrap:balance]">
        Music written for the novel <span className="text-white/70">{novel.title}</span>.
      </p>
      {art.spotify.href && (
        <div className="mt-4">
          <Btn variant="glass-dark" capsule href={art.spotify.href} icon={<ArrowUpRight size={14} />}>
            Spotify
          </Btn>
        </div>
      )}
    </div>
  );
}

function Queue({ compact }: { compact: boolean }) {
  const p = usePlayer();
  return (
    <div className={compact ? "" : "h-full overflow-auto bg-[var(--bg)] px-3 pb-4 pt-[52px]"} data-drag={compact ? undefined : ""}>
      {!compact && <div className="m-headline px-2 pb-2 text-ink">Up Next</div>}
      <List mac={!compact}>
        {tracks.map((t, i) => {
          const on = p.id === t.id;
          return (
            <ListRow
              key={t.id}
              mac={!compact}
              onClick={() => player.toggle(t.id)}
              icon={
                <span className={`relative block shrink-0 overflow-hidden shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)] ${compact ? "my-2 h-12 w-12 rounded-[8px]" : "h-9 w-9 rounded-[6px]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.cover} alt="" width={96} height={96} className="h-full w-full object-cover" />
                  {on && p.playing && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/40">
                      <Bars light />
                    </span>
                  )}
                </span>
              }
              title={<span className={on ? "font-semibold text-[var(--accent)]" : ""}>{t.title}</span>}
              sub={t.note}
              detail={<span className="tabular-nums">{t.durationLabel}</span>}
            />
          );
        })}
      </List>
      {art.spotify.href && (
        <div className="mt-3 px-1">
          <Btn size="sm" href={art.spotify.href} icon={<ArrowUpRight size={14} />}>
            Spotify
          </Btn>
        </div>
      )}
    </div>
  );
}

function Records() {
  const { compact } = useChrome();
  const p = usePlayer();
  const cur = trackOf(p.id);
  const [full, setFull] = useState(false);
  // closing the window quits the app, like Music; on the phone it keeps playing under the Dynamic Island
  useEffect(() => () => void (!useOS.getState().isMobile && player.stop()), []);
  // Now Playing is dark to the top edge: the status bar turns white over it
  useEffect(() => {
    if (!compact) return;
    useOS.getState().setHeroDark(full);
    return () => useOS.getState().setHeroDark(false);
  }, [compact, full]);
  if (!compact)
    return (
      <div className="relative h-full min-h-0">
        <MusicBackdrop />
        <div className="relative grid h-full min-h-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div data-drag className="min-h-0">
            <NowPlaying compact={false} />
          </div>
          <GlassQueue />
        </div>
      </div>
    );
  return (
    <div className="px-4 pb-28">
      <Queue compact />
      {/* the mini player; tap it for Now Playing */}
      <motion.button
        type="button"
        layoutId="np"
        onClick={() => setFull(true)}
        data-glass=""
        className={`${glass("pop")} fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+40px)] z-[30] flex h-14 items-center gap-3 rounded-[16px] px-2 text-left`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={(cur ?? tracks[0]).cover} alt="" className="h-10 w-10 rounded-[8px] object-cover" />
        <span className="t-sub min-w-0 flex-1 truncate font-medium text-ink">{cur?.title ?? "Not Playing"}</span>
        <span
          role="button"
          aria-label={p.playing ? "Pause" : "Play"}
          onClick={(e) => {
            e.stopPropagation();
            player.toggle();
          }}
          className="flex h-10 w-10 items-center justify-center text-ink"
        >
          {p.playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
        </span>
      </motion.button>
      <AnimatePresence>
        {full && (
          <motion.div
            key="np-full"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.45 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 700) && setFull(false)}
            className="fixed inset-0 z-[45] overflow-hidden rounded-t-[24px]"
          >
            <span className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+52px)] z-10 h-[5px] w-9 -translate-x-1/2 rounded-full bg-white/40" />
            <NowPlaying compact />
            <button
              type="button"
              aria-label="Close Now Playing"
              onClick={() => setFull(false)}
              data-glass=""
              className={`${glass("btn-dark")} glass-press absolute bottom-[calc(env(safe-area-inset-bottom)+40px)] left-1/2 z-10 -ml-[22px] flex h-11 w-11 items-center justify-center rounded-full text-white/90`}
            >
              <ChevronLeft size={22} strokeWidth={2.4} className="-rotate-90" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Novel: a Books-style library and reader ----------

type Chapter = { id: string; title: string; paragraphs: string[]; words: number; image?: string };
type Book = { title: string; author: string; illustrator: string; years: string; blurb: string; cover: string; chapters: Chapter[] };
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

function Novel() {
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
      <div className={`flex gap-7 ${compact ? "flex-col items-center text-center" : "items-start"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={novel.cover} alt={novel.title} draggable={false} data-sq="" className="book-cover aspect-[2/3] w-[168px] shrink-0 rounded-[10px] bg-[#0b0d12] object-cover" />
        <div className={`min-w-0 ${compact ? "" : "pt-1"}`}>
          <h1 className={`${SERIF} text-[28px] font-semibold leading-[1.12] tracking-[-0.015em] text-ink [text-wrap:balance]`}>{novel.title}</h1>
          <p className="t-sub mt-2 text-ink-2">{novel.author}</p>
          <p className="t-foot text-ink-3">Iliustracijos: {novel.illustrator}</p>
          <div className={`mt-4 flex items-center gap-3 ${compact ? "justify-center" : ""}`}>
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
            <div key={i} className="skeleton h-3 rounded-[4px]" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {compact && book && (
        <>
          <div className="mb-[7px] mt-8 px-4 text-left text-[13px] uppercase tracking-[-0.005em] text-[#6D6D72]">Contents</div>
          <div className="sq-list overflow-hidden rounded-[10px] bg-white text-left">
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
    <div className="flex h-full min-h-0">
      <aside data-drag className="flex w-[220px] shrink-0 flex-col overflow-auto border-r border-black/[0.06] bg-[#F4F4F6] px-2.5 pb-3 pt-[52px]">
        <button
          type="button"
          onClick={() => setCh(null)}
          className={`flex h-[28px] shrink-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] text-ink ${ch === null ? "bg-black/[0.08]" : "hov:hover:bg-black/[0.035]"}`}
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
                className={`flex h-[28px] shrink-0 items-center gap-2 rounded-[6px] px-2 text-left text-[13px] ${ch === i ? "bg-black/[0.08] text-ink" : "text-ink hov:hover:bg-black/[0.035]"}`}
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {saved?.ch === i && ch !== i && <span className="h-1.5 w-1.5 rounded-full bg-[#0A84FF]" />}
                <span className="text-[11px] tabular-nums text-ink-3">{minutes(c.words)}</span>
              </button>
            ))
          : Array.from({ length: 10 }, (_, i) => <div key={i} className="skeleton mx-2 my-[7px] h-3.5 shrink-0 rounded-[4px]" style={{ width: `${60 + ((i * 17) % 30)}%` }} />)}
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
              <div className="min-h-0 flex-1 overflow-auto">{library}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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
            <button type="button" onClick={() => setCh(ch + 1)} className="press mx-auto mt-12 flex h-9 items-center gap-1 rounded-full bg-[var(--accent-tint)] px-4 text-[13px] font-semibold text-[var(--accent)]">
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
      <div className="flex h-[calc(env(safe-area-inset-top)+100px)] shrink-0 items-end justify-between px-4 pb-2">
        <span className="text-[13px] font-semibold text-ink-3">{c.title}</span>
        <button type="button" onClick={onClose} aria-label="Close book" data-glass="" className={`${glass("btn")} flex h-9 w-9 items-center justify-center rounded-full text-[#3C3C43]/75`}>
          <X size={18} className="bold" />
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
      <div className="flex h-[54px] shrink-0 items-start justify-center pt-2 text-[12px] tabular-nums text-ink-3">
        {page + 1} of {pages}
      </div>
    </motion.div>
  );
}

// The Art persona's Gallery: the novel's chapter illustrations, credited to their illustrator.
const illustrations: Photo[] = Array.from({ length: 20 }, (_, i) => ({ title: `${i + 1} Skyrius`, src: `/content/novel/ch${String(i + 1).padStart(2, "0")}.png` }));
function Gallery() {
  return <PhotosApp title="Gallery" sub="Illustrations for the novel" photos={illustrations} credit={`Iliustracijos: ${novel.illustrator}`} />;
}

// Opens an app as a window on the desktop, or as a sheet on the phone.
function useOpenApp(id: AppId) {
  const open = useOS((s) => s.open);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const isMobile = useOS((s) => s.isMobile);
  return useCallback(() => (isMobile ? openPhoneApp(id) : open(id)), [id, isMobile, open, openPhoneApp]);
}

// ---------- Get in Touch ----------

const XMark = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="currentColor">
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2z" />
  </svg>
);
const channelIcon: Record<Channel["id"], React.ReactNode> = {
  email: <Mail size={15} strokeWidth={1.9} />,
  x: <XMark size={13} />,
  linkedin: <Linkedin size={15} strokeWidth={1.9} />,
  larpo: <Aperture size={15} strokeWidth={1.9} />,
  instagram: <Instagram size={15} strokeWidth={1.9} />,
  instagramStudio: <Instagram size={15} strokeWidth={1.9} />,
  github: <Github size={15} strokeWidth={1.9} />,
  spotify: <Music2 size={15} strokeWidth={1.9} />,
};
// a channel without its real link yet points at "#" so it still looks and behaves finished
const hrefOf = (c: Channel) => c.href ?? "#";

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setCopied(null), 1600);
  };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return { copied, copy };
}

function Contact() {
  const { compact } = useChrome();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const { copied, copy } = useCopied();
  const ready = `To: ${owner.name}\nSubject: ${subject.trim() || "Hello"}\n\n${body.trim() || "Hi Augustas,"}`;
  const send = () => {
    if (CONTACT_EMAIL) {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return;
    }
    copy("send", ready);
    setSent(true);
    useOS.getState().setActivity({ kind: "sent" });
  };
  const email = contactList.find((c) => c.id === "email")!;

  const sentNote = (
    <AnimatePresence>
      {sent && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className={`flex items-center gap-2.5 rounded-[10px] bg-[#E9F6EE] px-3 py-2.5 text-[13px] text-[#1F7A45] ${compact ? "mx-4 mt-3" : ""}`}
        >
          <Check size={15} strokeWidth={2.4} className="shrink-0" />
          <span className="min-w-0 flex-1">Message copied. Paste it into X or any channel below.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (compact) {
    const actions = [
      { k: "call", label: "Call", icon: <CalendarDays size={20} strokeWidth={1.9} />, href: bookCall.href },
      { k: "x", label: "X", icon: <XMark size={17} />, href: hrefOf(contactList.find((c) => c.id === "x")!) },
      { k: "mail", label: "Mail", icon: <Mail size={20} strokeWidth={1.9} />, href: hrefOf(email) },
    ];
    return (
      <div className="pb-10">
        <div className="flex flex-col items-center px-4 pt-1 text-center">
          <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-b from-[#A8ADB8] to-[#868B96] text-[36px] font-semibold text-white">A</div>
          <div className="mt-3 text-[22px] font-semibold tracking-[-0.02em] text-ink">{owner.name}</div>
          <div className="text-[15px] text-ink-2">{owner.role}</div>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 px-4">
          {actions.map((a) => (
            <a key={a.k} href={a.href} target={a.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="press flex h-[60px] flex-col items-center justify-center gap-1 rounded-[10px] bg-white text-[#0A84FF]">
              {a.icon}
              <span className="text-[11px] font-medium">{a.label}</span>
            </a>
          ))}
          <button type="button" onClick={() => copy("handle", owner.x.label)} className="press flex h-[60px] flex-col items-center justify-center gap-1 rounded-[10px] bg-white text-[#0A84FF]">
            {copied === "handle" ? <Check size={20} strokeWidth={2.2} /> : <Copy size={19} strokeWidth={1.9} />}
            <span className="text-[11px] font-medium">{copied === "handle" ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <div className="mx-4 mt-6 sq-list overflow-hidden rounded-[10px] bg-white">
          {contactList.map((c, j) => (
            <a key={c.id} href={hrefOf(c)} target={c.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="press-row flex min-h-[56px] items-center pl-4">
              <span className={`flex min-h-[56px] flex-1 flex-col justify-center pr-4 ${j ? "border-t-[0.5px] border-[#C6C6C8]" : ""}`}>
                {c.value !== c.label && <span className="text-[13px] text-ink">{c.label}</span>}
                <span className="text-[17px] tracking-[-0.02em] text-[#0A84FF]">{c.value}</span>
              </span>
            </a>
          ))}
        </div>
        <div className="mb-[7px] mt-7 px-8 text-[13px] uppercase tracking-[-0.005em] text-[#6D6D72]">New message</div>
        <div className="mx-4 sq-list overflow-hidden rounded-[10px] bg-white">
          <input
            id="contact-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-11 w-full bg-transparent px-4 text-[17px] tracking-[-0.02em] text-ink outline-none placeholder:text-[#C4C4C7]"
          />
          <div className="ml-4 border-t-[0.5px] border-[#C6C6C8]" />
          <textarea
            id="contact-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={5}
            className="block w-full resize-none bg-transparent px-4 py-3 text-[17px] leading-[22px] tracking-[-0.02em] text-ink outline-none placeholder:text-[#C4C4C7]"
          />
        </div>
        <div className="mx-4 mt-4 sq-list overflow-hidden rounded-[10px] bg-white">
          <button type="button" onClick={send} className="press-row flex h-11 w-full items-center justify-center text-[17px] font-semibold tracking-[-0.02em] text-[#0A84FF]">
            Send Message
          </button>
        </div>
        {sentNote}
      </div>
    );
  }

  const field = "flex h-9 items-center gap-2 border-b border-black/[0.06] px-4 text-[13px]";
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar title="New Message">
        <Button size="sm" variant="primary" onClick={send} icon={copied === "send" ? <Check size={13} strokeWidth={2.4} /> : <Send size={13} />}>
          {copied === "send" ? "Copied" : "Send"}
        </Button>
      </Toolbar>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* the contact card: who you're writing to, and the other ways to reach him */}
        <div className="flex items-center gap-4 border-b border-[var(--separator)] px-5 py-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#A8ADB8] to-[#7E838E] text-[24px] font-semibold text-white">A</div>
          <div className="min-w-0 flex-1">
            <div className="m-title truncate text-ink">{owner.name}</div>
            <div className="m-body truncate text-ink-2">{owner.role}</div>
          </div>
          <div className="flex gap-3">
            {[
              { label: "message", icon: <MessageCircle size={16} />, run: () => document.getElementById("contact-body")?.focus() },
              { label: "call", icon: <CalendarDays size={16} />, href: bookCall.href },
              { label: "mail", icon: <Mail size={16} />, href: hrefOf(email) },
              { label: "X", icon: <XMark size={13} />, href: owner.x.href },
            ].map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-1">
                <Btn variant="tinted" capsule iconOnly size="md" label={a.label} href={a.href} onClick={a.run} icon={a.icon} className="!h-9 !w-9" />
                <span className="m-sub text-[var(--accent)]">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={field}>
          <span className="w-[58px] text-right text-ink-3">To:</span>
          <span className="inline-flex h-[22px] items-center rounded-[6px] bg-[#0A84FF]/[0.1] px-2 text-[13px] font-medium text-[#0A84FF]">{owner.name}</span>
        </div>
        <label htmlFor="contact-subject" className={field}>
          <span className="w-[58px] text-right text-ink-3">Subject:</span>
          <input
            id="contact-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
            autoComplete="off"
          />
        </label>
        <textarea
          id="contact-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message"
          className="min-h-[150px] flex-1 resize-none bg-transparent px-4 py-3 text-[13px] leading-[20px] text-ink outline-none placeholder:text-ink-3"
        />
        <div className="space-y-3 border-t border-black/[0.06] bg-[#F7F7F9] p-4">
          {sentNote}
          <div className="grid grid-cols-3 gap-2">
            <QuickAction href={bookCall.href} icon={<CalendarDays size={16} strokeWidth={1.9} />} label={bookCall.label} sub={bookCall.sub} />
            <QuickAction href={owner.x.href} icon={<XMark size={14} />} label="Message on X" sub={owner.x.label} />
            {CONTACT_EMAIL ? (
              <QuickAction
                onClick={() => copy("email", CONTACT_EMAIL ?? "")}
                icon={copied === "email" ? <Check size={16} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={1.9} />}
                label={copied === "email" ? "Copied" : "Copy email"}
                sub={email.value}
              />
            ) : (
              <QuickAction href={CONTACTS.linkedin.href ?? "#"} icon={<Linkedin size={15} strokeWidth={1.9} />} label="LinkedIn" sub={CONTACTS.linkedin.value} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 @container">
            {contactList
              .filter((c) => c.id !== "x" && (CONTACT_EMAIL ? true : c.id !== "linkedin"))
              .map((c) => (
                <a
                  key={c.id}
                  href={hrefOf(c)}
                  target={c.href?.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="group flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] hov:hover:bg-black/[0.04]"
                >
                  <span className="flex h-4 w-4 items-center justify-center text-ink-2">{channelIcon[c.id]}</span>
                  <span className="text-ink">{c.label}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-ink-3">{c.value !== c.label ? c.value : ""}</span>
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, onClick, icon, label, sub }: { href?: string; onClick?: () => void; icon: React.ReactNode; label: string; sub: string }) {
  const cls = "press lift sq flex flex-col items-start gap-2 rounded-[12px] bg-[var(--bg-elevated)] p-3 text-left shadow-[var(--shadow-1)]";
  const inner = (
    <>
      <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[var(--accent-tint)] text-[var(--accent)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        <span className="block truncate text-[11px] text-ink-3">{sub}</span>
      </span>
    </>
  );
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

// ---------- Trash ----------

function TrashApp() {
  const trash = useOS((s) => s.trash);
  const putBack = useOS((s) => s.putBack);
  const emptyTrash = useOS((s) => s.emptyTrash);
  const ctx = useContextMenu();
  const [sel, setSel] = useState<string | null>(null);
  const items = trash.map((id) => desktopItems.find((d) => d.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="flex h-full min-h-0 flex-col" onPointerDown={() => setSel(null)}>
      <Toolbar title="Trash" sub={items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : undefined}>
        {sel && (
          <Button size="sm" icon={<Undo2 size={14} />} onClick={() => (putBack([sel]), setSel(null))}>
            Put Back
          </Button>
        )}
        <Button size="sm" icon={<Trash2 size={14} />} onClick={() => items.length && (emptyTrash())}>
          Empty
        </Button>
      </Toolbar>
      {items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] content-start gap-y-3 overflow-auto p-4">
          {items.map((it) => (
            <button
              type="button"
              key={it.id}
              onPointerDown={(e) => (e.stopPropagation(), setSel(it.id))}
              onDoubleClick={() => (putBack([it.id]))}
              onContextMenu={(e) => {
                setSel(it.id);
                ctx.open(e, [{ label: "Put Back", run: () => (putBack([it.id])) }, "sep", { label: "Empty Trash", run: () => (emptyTrash()) }]);
              }}
              className="flex flex-col items-center gap-1 outline-none"
            >
              <span className={`flex h-[72px] w-[72px] items-center justify-center rounded-[6px] ${sel === it.id ? "bg-black/[0.08]" : ""}`}>
                <DeskArt item={it} />
              </span>
              <span className={`line-clamp-2 max-w-[92px] rounded-[4px] px-[5px] py-px text-center text-[12px] leading-[15px] ${sel === it.id ? "bg-[#0A84FF] text-white" : "text-ink"}`}>{it.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<Trash2 size={22} />} title="Trash is empty" body="Drag an item from the desktop onto the Trash in the Dock." />
      )}
      {ctx.node}
    </div>
  );
}

// ---------- About (spec sheet) ----------

function About() {
  const { compact } = useChrome();
  const openContact = useOpenApp("contact");
  return (
    // laid out like About This Mac: the machine (here, the person), its name, a short spec sheet, two buttons, the fine print
    <div data-drag className={`flex h-full flex-col items-center overflow-auto bg-[var(--bg)] px-6 text-center ${compact ? "pb-14 pt-2" : "pb-5 pt-11"}`}>
      <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full bg-[radial-gradient(120%_120%_at_30%_15%,#ffffff_0%,#e9eaee_45%,#c9ccd3_100%)] text-[46px] font-semibold tracking-[-0.03em] text-[#17181b] shadow-[0_14px_34px_-14px_rgb(16_18_24/0.45),inset_0_-2px_6px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.08)]">
        A
      </div>
      <h1 className={`mt-5 text-ink ${compact ? "t-large" : "m-large"}`}>{owner.name}</h1>
      <p className={`mt-1 text-ink-2 ${compact ? "t-sub" : "m-body"}`}>{owner.role}</p>
      <dl className={`mt-6 grid w-full max-w-[290px] grid-cols-[96px_1fr] gap-x-3 gap-y-[6px] ${compact ? "t-foot" : "text-[12px] leading-[16px]"}`}>
        {spec.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-right font-medium text-ink">{r.label}</dt>
            <dd className="text-left text-ink-2">{r.value}</dd>
          </div>
        ))}
      </dl>
      {compact ? (
        <div className="mt-8 flex w-full max-w-[320px] flex-col gap-2.5">
          <Btn variant="prominent" size="lg" capsule onClick={openContact} icon={<Send size={16} />}>
            Get in Touch
          </Btn>
          <Btn variant="tinted" size="lg" capsule href={owner.studio.href} icon={<ArrowUpRight size={17} />}>
            {owner.studio.label}
          </Btn>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={openContact} icon={<Send size={13} />}>
            Get in Touch…
          </Button>
          <Button size="sm" href={owner.studio.href} icon={<ArrowUpRight size={14} />}>
            More Info…
          </Button>
        </div>
      )}
      <p className="mt-auto pt-6 text-[10px] leading-[14px] text-ink-3">
        ™ and © {new Date().getFullYear()} {owner.name}.
        <br />
        All rights reserved.
      </p>
    </div>
  );
}

// ---------- shared ----------

function Terminal() {
  const { open, setSound, sound, openPhoneApp, isMobile } = useOS();
  const [lines, setLines] = useState<string[]>(() => [
    `Last login: ${new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/,/g, "")} on ttys000`,
    'Type "help" to see what you can do.',
  ]);
  const [v, setV] = useState("");
  const { compact } = useChrome();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // what was typed before, for the up and down arrows
  const past = useRef<string[]>([]);
  const at = useRef(0);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const all: AppId[] = [...allApps, ...projectApps.filter((a) => !allApps.includes(a))];
  const run = (raw: string) => {
    const [cmd, arg] = raw.trim().split(/\s+/);
    const out: string[] = [];
    switch (cmd) {
      case "":
        break;
      case "help":
        out.push(
          "whoami          who runs this machine",
          "ls              apps on this machine",
          "open <app>      open an app",
          "sound on|off    toggle sound",
          "clear           clear the screen",
        );
        break;
      case "whoami":
        out.push(`${owner.name}. ${owner.role}, ${owner.city}.`);
        break;
      case "ls":
        out.push(all.map((a) => apps[a].title.toLowerCase().split(" ")[0]).join("   "));
        break;
      case "open": {
        const id = all.find((a) => a === arg || apps[a].title.toLowerCase().startsWith(arg ?? "~"));
        if (id) {
          if (isMobile) openPhoneApp(id);
          else open(id);
          out.push(`Opening ${apps[id].title}`);
        } else out.push(`open: no app called "${arg ?? ""}". Try ls.`);
        break;
      }
      case "sound": {
        const next = arg ? arg === "on" : !sound;
        setSound(next);
        out.push(`Sound ${next ? "on" : "off"}`);
        break;
      }
      case "clear":
        setLines([]);
        return;
      default:
        out.push(`zsh: command not found: ${cmd}`);
    }
    setLines((l) => [...l, `augustas@os ~ % ${raw}`, ...out]);
  };

  return (
    <div onClick={() => !compact && input.current?.focus()} className={`terminal on-dark flex h-full min-h-[260px] flex-col bg-[#1C1D20] leading-[1.6] text-[#E4E6EA] ${compact ? "pb-24 text-[13px]" : "text-[12px]"}`}>
      <Toolbar title={<span className="text-white/80">Terminal</span>} sub={<span className="text-white/40">zsh</span>} />
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono">
        {lines.map((l, i) => (
          <div key={i} className={`whitespace-pre-wrap ${l.startsWith("augustas@os") ? "text-white" : "text-[#A9ADB5]"}`}>
            {l}
          </div>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (v.trim()) past.current.push(v);
            at.current = past.current.length;
            run(v);
            setV("");
          }}
        >
          <span className="shrink-0 text-white">augustas@os ~ %</span>
          <input
            id="terminal-input"
            ref={input}
            autoFocus={!isMobile}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              e.preventDefault();
              at.current = Math.max(0, Math.min(past.current.length, at.current + (e.key === "ArrowUp" ? -1 : 1)));
              setV(past.current[at.current] ?? "");
            }}
            aria-label="Command"
            enterKeyHint="go"
            autoCorrect="off"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-white caret-[#E4E6EA] outline-none sm:text-[12px]"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />
        </form>
        <div ref={end} />
      </div>
      {/* on the phone the commands are one tap away, above the home indicator */}
      {compact && (
        <div data-glass="" className="glass glass-btn-dark no-scrollbar fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+36px)] z-[30] flex h-[52px] items-center gap-1.5 overflow-x-auto overscroll-contain rounded-full px-2">
          {["help", "whoami", "ls", "open projects", "open records", "sound", "clear"].map((c) => (
            <button
              type="button"
              key={c}
              onClick={(e) => {
                e.stopPropagation();
                run(c);
              }}
              className="glass-press h-9 shrink-0 rounded-full bg-white/[0.12] px-3.5 font-mono text-[13px] text-white"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Game() {
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(0);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const best = useRef(0);
  const running = left > 0;
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => setLeft((l) => l - 1), 1000);
    return () => window.clearInterval(iv);
  }, [running]);
  if (!running && score > best.current) best.current = score;
  const move = () => setPos({ x: 10 + Math.random() * 80, y: 15 + Math.random() * 70 });
  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <Toolbar title="Catch" sub={running ? `${left}s left` : `Best ${best.current}`}>
        <span className="text-[13px] font-semibold tabular-nums text-ink">{score}</span>
      </Toolbar>
      <div className="relative m-3 flex-1 overflow-hidden rounded-[12px] bg-[#F7F7F9] ring-1 ring-black/[0.05]">
        {running ? (
          <motion.button
            type="button"
            aria-label="Catch the dot"
            onPointerDown={() => {
              setScore((s) => s + 1);
              move();
            }}
            animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.35 }}
            className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-[14px] font-semibold text-ink">{score ? `You caught ${score}` : "Catch the dot"}</div>
            <div className="text-[12px] text-ink-2">Tap it as many times as you can in 15 seconds.</div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setScore(0);
                setLeft(15);
                move();
              }}
            >
              {score ? "Play again" : "Start"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsApp() {
  const { sound, setSound, wallpaper, setWallpaper, appearance, setAppearance, tintedIcons, setTintedIcons, reduceEffects, setReduceEffects } = useOS();
  const { compact } = useChrome();
  const [sel, setSel] = useState("appearance");
  const choice = useQualityChoice();
  const quality = useQuality();
  const tile = (color: string, icon: React.ReactNode) => (
    <IconTile color={color} size={compact ? 29 : 20}>
      {icon}
    </IconTile>
  );
  const sz = compact ? 17 : 12;
  const looks: { v: "light" | "dark" | "auto"; label: string }[] = [
    { v: "light", label: "Light" },
    { v: "dark", label: "Dark" },
    { v: "auto", label: "Auto" },
  ];
  const pane =
    sel === "appearance" ? (
      <div className="space-y-6">
        <div>
          <SectionHeader mac={!compact}>Appearance</SectionHeader>
          <List mac={!compact} className="p-4">
            <div className="grid grid-cols-3 gap-4">
              {looks.map((l) => {
                const on = appearance === l.v;
                return (
                  <button type="button" key={l.v} onClick={() => setAppearance(l.v)} aria-pressed={on} className="press flex flex-col items-center gap-2">
                    <Squircle
                      radius={10}
                      className={`relative aspect-[16/10] w-full overflow-hidden ${on ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-elevated)]" : "shadow-[var(--shadow-1)]"}`}
                      style={{
                        background:
                          l.v === "light"
                            ? "linear-gradient(160deg,#eef0f4,#cfd5df)"
                            : l.v === "dark"
                              ? "linear-gradient(160deg,#2c2f38,#0e1014)"
                              : "linear-gradient(90deg,#e7eaf0 50%,#1a1c22 50%)",
                      }}
                    >
                      <span className={`absolute left-[12%] top-[16%] h-[54%] w-[64%] rounded-[5px] shadow-[0_4px_10px_-4px_rgb(0_0_0/0.4)] ${l.v === "dark" ? "bg-[#2c2c2e]" : "bg-[#fff]"}`}>
                        <span className="absolute left-[6px] top-[5px] flex gap-[3px]">
                          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
                            <span key={c} className="h-[5px] w-[5px] rounded-full" style={{ background: c }} />
                          ))}
                        </span>
                      </span>
                    </Squircle>
                    <span className={`${compact ? "t-sub" : "m-body"} ${on ? "font-semibold text-ink" : "text-ink-2"}`}>{l.label}</span>
                  </button>
                );
              })}
            </div>
          </List>
        </div>
        <List mac={!compact}>
          <ListRow mac={!compact} icon={tile("#5856D6", <Palette size={sz} />)} title="Tinted app icons" sub="Icons take the accent colour" detail={<Switch on={tintedIcons} onChange={setTintedIcons} label="Tinted app icons" />} />
          <ListRow mac={!compact} icon={tile("#8E8E93", <Contrast size={sz} />)} title="Reduce effects" sub="Solid surfaces instead of glass, gentler motion" detail={<Switch on={reduceEffects} onChange={setReduceEffects} label="Reduce effects" />} />
        </List>
      </div>
    ) : sel === "wallpaper" ? (
      <div>
        <SectionHeader mac={!compact}>Desktop picture</SectionHeader>
        <List mac={!compact} className="p-3">
          <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @xl:grid-cols-4">
            {wallpapers.map((w, i) => {
              const on = wallpaper === i;
              const live = w.src.startsWith("live:");
              return (
                <button type="button" key={w.src} onClick={() => setWallpaper(i)} aria-pressed={on} className="press text-left">
                  <Squircle
                    radius={10}
                    className={`relative block aspect-[16/10] overflow-hidden bg-cover bg-center ${on ? "ring-[3px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg-elevated)]" : "shadow-[var(--shadow-1)]"} ${live ? "bg-[#070b16]" : ""}`}
                    style={live ? undefined : { backgroundImage: `url(${w.src})` }}
                  >
                    {live && (
                      <span className="absolute inset-0">
                        <MusicShader intensity={0.6} palette="night" />
                      </span>
                    )}
                  </Squircle>
                  <span className="m-sub mt-1.5 block truncate text-ink-2">{live ? "Live, follows the music" : w.by}</span>
                </button>
              );
            })}
          </div>
        </List>
      </div>
    ) : sel === "sound" ? (
      <List mac={!compact}>
        <ListRow mac={!compact} icon={tile("#FF2D55", <Volume2 size={sz} />)} title="Play sound" sub="The startup chime and music" detail={<Switch on={sound} onChange={setSound} label="Play sound" />} />
      </List>
    ) : (
      // Graphics: the quality of the 3D world the desk sits in (src/lib/quality.ts, shared with the scene)
      <div>
        <SectionHeader mac={!compact}>3D world quality</SectionHeader>
        <List mac={!compact}>
          {(Object.keys(QUALITY_LABELS) as QualityChoice[]).map((c) => (
            <ListRow
              mac={!compact}
              key={c}
              onClick={() => setQualityChoice(c)}
              title={QUALITY_LABELS[c]}
              sub={c === "auto" ? `Follows this device, now ${QUALITY_LABELS[quality.preset]}` : undefined}
              detail={choice === c ? <Check size={compact ? 18 : 14} className="bold text-[var(--accent)]" /> : undefined}
            />
          ))}
        </List>
        <p className={`mt-2 px-1 text-ink-3 ${compact ? "t-foot px-4" : "m-sub"}`}>Applies to the desk and the field around it. Lower settings draw less grass, fewer effects and a softer picture.</p>
      </div>
    );
  const title = { appearance: "Appearance", wallpaper: "Wallpaper", sound: "Sound", graphics: "Graphics" }[sel] ?? "";
  return (
    <SplitView
      selected={sel}
      onSelect={setSel}
      header={
        // the account row System Settings opens with
        compact ? (
          <List className="mt-2">
            <ListRow icon={<span className="my-2"><Monogram size={56} /></span>} title={<span className="t-title3">{owner.name}</span>} sub={owner.role} />
          </List>
        ) : (
          <div className="flex items-center gap-2.5 px-2 pb-1">
            <Monogram size={36} />
            <span className="min-w-0">
              <span className="m-headline block truncate text-ink">{owner.name}</span>
              <span className="m-sub block truncate text-ink-2">{owner.city}</span>
            </span>
          </div>
        )
      }
      sections={[
        {
          items: [
            { id: "appearance", label: "Appearance", icon: tile("#48484A", <Contrast size={sz} />) },
            { id: "wallpaper", label: "Wallpaper", icon: tile("#32ADE6", <Wallpaper size={sz} />) },
            { id: "sound", label: "Sound", icon: tile("#FF2D55", <Volume2 size={sz} />) },
            { id: "graphics", label: "Graphics", icon: tile("#34C759", <Gauge size={sz} />) },
          ],
        },
      ]}
      detail={
        <div className="@container flex min-h-full flex-col bg-[var(--bg-grouped)]">
          <Toolbar title={title} />
          <div className={compact ? "px-4 pb-8" : "p-6"}>{pane}</div>
        </div>
      }
    />
  );
}

// ---------- Finder: the folders (Projects, Games, Music, Photos, Documents) ----------

const PLACE_ICON: Record<PlaceId, React.ReactNode> = {
  projects: <Folder size={15} />,
  games: <Gamepad2 size={15} />,
  music: <Music2 size={15} />,
  photos: <ImageIcon size={15} />,
  documents: <FileText size={15} />,
};
function FinderIcon({ it, size }: { it: FinderItem; size: number }) {
  if (it.look?.type === "resume") return <DocArt size={size} />;
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

function Finder({ start }: { start: PlaceId }) {
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
    } else if (it.app) openAny(it.app);
    else if (it.look) setLook(it.look.type === "resume" ? { title: it.name, node: <Resume /> } : { title: it.name, src: it.look.src });
  };
  const sections = [{ title: "Favourites", items: places.map((p) => ({ id: p.id, label: p.title, icon: <span className="text-[var(--accent)]">{PLACE_ICON[p.id]}</span> })) }];
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
              <ListRow key={it.id} onClick={() => run(it)} icon={<span className="my-1.5 flex h-11 w-11 shrink-0 items-center justify-center"><FinderIcon it={it} size={44} /></span>} title={it.name} sub={it.kind} chevron />
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
          icon={<ArrowDownUp size={13} />}
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
                      className="group flex flex-col items-center gap-1.5 rounded-[10px] px-1 py-2 outline-none"
                    >
                      <span className={`flex h-[78px] w-[78px] items-center justify-center rounded-[12px] transition-colors duration-100 ${on ? "bg-[var(--selection)]" : "hov:group-hover:bg-[var(--hover)]"}`} data-sq="">
                        <FinderIcon it={it} size={60} />
                      </span>
                      <span className={`line-clamp-2 max-w-[108px] rounded-[5px] px-[6px] py-px text-center text-[12px] font-medium leading-[15px] ${on ? "bg-[var(--accent)] text-white" : "text-ink group-focus-visible:bg-[var(--accent)] group-focus-visible:text-white"}`}>{it.name}</span>
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
                      className={`flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left outline-none ${on ? "bg-[var(--accent)] text-white" : "text-ink odd:bg-[var(--fill-2)] focus-visible:bg-[var(--accent)] focus-visible:text-white"}`}
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
        <ChevronRight size={11} className="text-ink-3" />
        <span className="m-sub">{cur.title}</span>
        {picked && (
          <>
            <ChevronRight size={11} className="text-ink-3" />
            <span className="m-sub truncate font-medium text-ink">{picked.name}</span>
          </>
        )}
        <span className="flex-1" />
        {picked ? (
          <Btn size="sm" variant="tinted" capsule onClick={() => run(picked)}>
            Open
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
        <h1 className="t-large px-4 pb-2 text-ink">{cur.title}</h1>
        <div className="pb-24">{phoneDetail}</div>
        <TabBar
          id={`finder-${start}`}
          value={place as PlaceId}
          onChange={(id) => {
            setPlace(id);
            setQ("");
          }}
          items={places.map((p) => ({ value: p.id, label: p.title, icon: <span className="[&>svg]:h-[22px] [&>svg]:w-[22px]">{PLACE_ICON[p.id]}</span> }))}
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

const Blocks = dynamic(() => import("./games/Blocks"), { ssr: false, loading: () => <div className="flex h-full items-center justify-center bg-black text-[13px] text-white/50">Loading…</div> });
function BlocksApp() {
  const { compact } = useChrome();
  return (
    <div className={`bg-black ${compact ? "fixed inset-0" : "relative h-full"}`}>
      <Blocks compact={compact} />
    </div>
  );
}

export function AppView({ id }: { id: AppId }) {
  if (projects[id]) return <ProjectApp id={id} />;
  switch (id) {
    case "projects":
      return <Finder start="projects" />;
    case "games":
      return <Finder start="games" />;
    case "blocks":
      return <BlocksApp />;
    case "shots":
      return <Shots />;
    case "taste":
      return <Taste />;
    case "kit":
      return <Kit />;
    case "doom":
      return <Doom />;
    case "records":
      return <Records />;
    case "piano":
      return <PianoApp />;
    case "novel":
      return <Novel />;
    case "gallery":
      return <Gallery />;
    case "about":
      return <About />;
    case "contact":
      return <Contact />;
    case "trash":
      return <TrashApp />;
    case "terminal":
      return <Terminal />;
    case "game":
      return <Game />;
    case "settings":
      return <SettingsApp />;
    default:
      return null;
  }
}

export { AppIcon };
