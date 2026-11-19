// Everything visible on the site lives in this one file.
// Real names and facts only; where something isn't known yet, leave it out.
// Never put private details (email, phone, address) here.

// The 3D intro still hands the screen over with one of these (which object on the desk was picked). The OS itself
// has one desktop and ignores which.
export type UserId = "engineer" | "founder" | "art";

export type AppId =
  // Finder folders, and the apps that stand on their own
  | "projects" | "games" | "shots" | "taste" | "kit"
  // Work (case studies)
  | "sellify" | "kaching"
  // Ventures
  | "larpo" | "lunor" | "capto" | "contles" | "filzy" | "filzymovie"
  // Lab
  | "rug" | "slideskipper" | "musicengine" | "trackpad" | "reel" | "openwhip"
  // Games
  | "doom" | "blocks"
  // Music, writing, pictures
  | "records" | "piano" | "novel" | "gallery"
  // System
  | "about" | "contact" | "terminal" | "game" | "settings" | "trash" | "launchpad";

export const owner = {
  name: "Augustas",
  role: "Design engineer and founder",
  city: "Kaunas, Lithuania",
  x: { label: "@augustasdesign", href: "https://x.com/augustasdesign" },
  studio: { label: "larpo.studio", href: "https://larpo.studio" },
};

export type Wallpaper = { src: string; by: string; href: string; dark: boolean };

// Every desktop picture, in one set. The first is the default; "live:music" is the audio-reactive shader.
export const wallpapers: Wallpaper[] = [
  { src: "/wallpapers/engineer-joel-filipe.jpg", by: "Joel Filipe", href: "https://unsplash.com/photos/OxeG5GiOiqM", dark: false },
  { src: "/wallpapers/engineer-pawel-curves.jpg", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/C6rZgXbNxJk", dark: false },
  { src: "/wallpapers/engineer-pawel-structure.jpg", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/9T8fywAF54I", dark: false },
  { src: "/wallpapers/engineer-pawel-folds.jpg", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/TtAoOVEXgMw", dark: false },
  { src: "/wallpapers/founder-uran-wang.jpg", by: "Uran Wang", href: "https://unsplash.com/photos/5wDq-27_zKI", dark: true },
  { src: "/wallpapers/founder-farnaz-kohankhaki.jpg", by: "Farnaz Kohankhaki", href: "https://unsplash.com/photos/LuN2RBcXO6w", dark: true },
  { src: "/wallpapers/founder-mountain-sunset.jpg", by: "Unsplash", href: "https://unsplash.com/photos/vay2UUzHnfw", dark: true },
  { src: "/wallpapers/founder-foggy-sunrise.jpg", by: "Zetong Li", href: "https://unsplash.com/photos/MaeshPdBGV4", dark: true },
  { src: "/wallpapers/founder-mountain-glow.jpg", by: "Urban Vintage", href: "https://unsplash.com/photos/0HF6s01qyIw", dark: true },
  { src: "live:music", by: "Live", href: "", dark: true },
  { src: "/wallpapers/art-bernd-dittrich.jpg", by: "Bernd Dittrich", href: "https://unsplash.com/photos/wLhmecNUVNc", dark: true },
  { src: "/wallpapers/art-thom-milkovic.jpg", by: "Thom Milkovic", href: "https://unsplash.com/photos/1MSHtu4pkBM", dark: true },
  { src: "/wallpapers/art-tinky-rain-blue.jpg", by: "Tinky", href: "https://unsplash.com/photos/Z9AW35oeFEo", dark: true },
  { src: "/wallpapers/art-satyajit-rain.jpg", by: "Satyajit", href: "https://unsplash.com/photos/3XiPqV2fKeE", dark: true },
];

// The lock screen sits on this one.
export const loginWallpaper = wallpapers[0];

// The Dock, left to right: his apps, then the system ones after the divider.
export const dockApps: AppId[] = ["projects", "games", "records", "novel", "shots", "gallery", "piano"];
export const sharedApps: AppId[] = ["contact", "terminal", "settings"];
// Everything that can be opened by name (Apps grid, Spotlight, Terminal).
export const allApps: AppId[] = [...dockApps, "doom", "blocks", "taste", "kit", ...sharedApps, "about"];

// The Projects folder, in its groups.
export const projectGroups: { id: string; title: string; apps: AppId[] }[] = [
  { id: "work", title: "Work", apps: ["sellify", "kaching"] },
  { id: "ventures", title: "Ventures", apps: ["larpo", "lunor", "capto", "contles", "filzy", "filzymovie"] },
  { id: "lab", title: "Lab", apps: ["rug", "slideskipper", "musicengine", "reel", "openwhip"] },
];
export const labApps: AppId[] = projectGroups[2].apps;
export const projectApps: AppId[] = projectGroups.flatMap((g) => g.apps);
export const gameApps: AppId[] = ["doom", "blocks"];

type Size = { w: number; h: number };
export const apps: Record<AppId, { title: string; size: Size }> = {
  projects: { title: "Projects", size: { w: 980, h: 640 } },
  games: { title: "Games", size: { w: 980, h: 640 } },
  shots: { title: "Shots", size: { w: 1000, h: 660 } },
  taste: { title: "Taste", size: { w: 700, h: 430 } },
  kit: { title: "Kit", size: { w: 480, h: 400 } },
  sellify: { title: "Sellify", size: { w: 960, h: 700 } },
  kaching: { title: "Kaching", size: { w: 960, h: 700 } },
  larpo: { title: "Larpo", size: { w: 1100, h: 700 } },
  lunor: { title: "Lunor", size: { w: 900, h: 680 } },
  capto: { title: "Capto", size: { w: 900, h: 680 } },
  contles: { title: "Contles", size: { w: 900, h: 680 } },
  filzy: { title: "Filzy", size: { w: 1100, h: 700 } },
  filzymovie: { title: "Filzy Movie", size: { w: 1100, h: 700 } },
  rug: { title: "Road Rug", size: { w: 900, h: 640 } },
  slideskipper: { title: "Slide Skipper", size: { w: 900, h: 640 } },
  musicengine: { title: "Music Engine", size: { w: 900, h: 640 } },
  trackpad: { title: "Trackpad Test", size: { w: 560, h: 420 } },
  reel: { title: "Reel", size: { w: 900, h: 640 } },
  openwhip: { title: "OpenWhip", size: { w: 900, h: 640 } },
  doom: { title: "DOOM", size: { w: 800, h: 560 } },
  blocks: { title: "Blocks", size: { w: 920, h: 620 } },
  records: { title: "Records", size: { w: 920, h: 600 } },
  piano: { title: "Piano", size: { w: 760, h: 320 } },
  novel: { title: "Novel", size: { w: 1040, h: 700 } },
  gallery: { title: "Gallery", size: { w: 760, h: 540 } },
  about: { title: "About Augustas", size: { w: 300, h: 470 } },
  contact: { title: "Get in Touch", size: { w: 720, h: 640 } },
  terminal: { title: "Terminal", size: { w: 680, h: 440 } },
  game: { title: "Catch", size: { w: 460, h: 400 } },
  settings: { title: "System Settings", size: { w: 820, h: 560 } },
  trash: { title: "Trash", size: { w: 620, h: 420 } },
  launchpad: { title: "Apps", size: { w: 0, h: 0 } },
};

// One template for every project.
export type Project = {
  id: string;
  name: string;
  what?: string;
  role?: string;
  years?: string;
  stack?: string;
  status?: string;
  image?: string;
  images?: string[];
  numbers: { label: string; value: string }[];
  link?: { label: string; href: string };
  // the live site may be shown inside the window (it allows framing); false or missing shows the story instead
  embeddable?: boolean;
  // how it opens from the Projects folder: a case study (the story page), a website (the live site beside its
  // explanation) or code (a repository view). Left out, it follows from the fields above.
  kind?: "case" | "site" | "code";
  // code projects: the repository, when it's public
  repo?: string;
};

// ---------- Work: case studies ----------

export const mainWork: Project = {
  id: "sellify",
  name: "Sellify",
  what: "AI tools for finding, making and running ads.",
  role: "Product designer",
  years: "2025 – now",
  image: "/img/work-sellify.jpg",
  images: ["/img/work-sellify-2.jpg"],
  numbers: [{ label: "Kit components", value: "45" }],
  kind: "case",
};

export const otherWork: Project[] = [
  {
    id: "kaching",
    name: "Kaching",
    what: "Website for Kaching's Shopify apps.",
    role: "Design and build",
    years: "2026",
    image: "/img/work-kaching.jpg",
    numbers: [{ label: "App sections", value: "6" }],
    kind: "case",
  },
];

export const shots = {
  handle: "@augustasdesign",
  href: "https://x.com/augustasdesign",
  items: [
    { title: "Kite", src: "/img/shot-kite.jpg" },
    { title: "Kestrel", src: "/img/shot-kestrel.jpg" },
    { title: "Quorum", src: "/img/shot-quorum.jpg" },
    { title: "Kelvane", src: "/img/shot-kelvane.jpg" },
    { title: "Tempra", src: "/img/shot-tempra.jpg" },
    { title: "Spindle", src: "/img/shot-spindle.jpg" },
    { title: "Tandem", src: "/img/shot-tandem.jpg" },
    { title: "Kinora", src: "/img/shot-kinora.jpg" },
    { title: "Linnet", src: "/img/shot-linnet.jpg" },
    { title: "Halyard", src: "/img/shot-halyard.jpg" },
    { title: "Ferry", src: "/img/shot-ferry.jpg" },
    { title: "Rimeo", src: "/img/shot-rimeo.jpg" },
  ],
};

export const taste = {
  rules: ["Cool greys only.", "No pill shapes. Small, even corners.", "Motion needs a reason.", "Regular layouts, new parts.", "Measure. 4px matters."],
  rated: ["Marcel", "rico", "Basit", "Adrian Kuleszo", "Emil Kowalski"],
};

// ---------- Projects: one app each ----------

export const projects: Partial<Record<AppId, Project>> = {
  sellify: mainWork,
  kaching: otherWork[0],
  larpo: {
    id: "larpo",
    name: "Larpo",
    what: "Design studio in Kaunas. Brand, product and content.",
    role: "Founder",
    years: "2026 – now",
    image: "/img/larpo-og.jpg",
    numbers: [
      { label: "Posts a day", value: "2" },
      { label: "New site", value: "14 Nov" },
    ],
    link: { label: "larpo.studio", href: "https://larpo.studio" },
    embeddable: true,
  },
  lunor: {
    id: "lunor",
    name: "Lunor",
    what: "A design library. Free, Premium and Lifetime plans.",
    role: "Founder",
    status: "Live",
    stack: "Next.js, Supabase, Stripe",
    numbers: [{ label: "Lifetime", value: "€29.99" }],
  },
  capto: {
    id: "capto",
    name: "Capto",
    what: "Captions for video, in the browser. Your video never leaves your device.",
    role: "Founder",
    status: "Live",
    years: "2026",
    stack: "Next.js, Cloudflare, Whisper",
    image: "/img/venture-capto.jpg",
    numbers: [
      { label: "Caption styles", value: "9" },
      { label: "Free exports a month", value: "3" },
    ],
  },
  contles: {
    id: "contles",
    name: "Contles",
    what: "Brands book creators for paid campaigns.",
    role: "Design and front end",
    status: "Live",
    numbers: [],
  },
  filzy: {
    id: "filzy",
    name: "Filzy",
    what: "Send files between devices. Drop to the cloud, or beam peer to peer.",
    role: "Founder",
    status: "Live",
    stack: "Vite, WebRTC, Cloudflare Workers",
    numbers: [],
    link: { label: "Open Filzy", href: "https://augustas-armalis.github.io/filzy/" },
    embeddable: true,
  },
  filzymovie: {
    id: "filzymovie",
    name: "Filzy Movie",
    role: "Founder",
    status: "Live",
    numbers: [],
    link: { label: "filzy.site/movie", href: "https://filzy.site/movie" },
    embeddable: true,
  },
  // Lab
  rug: {
    id: "rug",
    name: "Road Rug",
    what: "A physics rug for your desktop. Sweep your mess under it.",
    stack: "macOS, Swift",
    numbers: [],
    kind: "code",
    repo: "https://github.com/augustas-rug/road-rug",
  },
  slideskipper: { id: "slideskipper", name: "Slide Skipper", numbers: [], kind: "code" },
  musicengine: {
    id: "musicengine",
    kind: "code",
    name: "Music Engine",
    what: "A composing engine built from studied scores: a notation language, music21 and rule checks.",
    stack: "Python, music21",
    numbers: [{ label: "Scores studied", value: "21" }],
  },
  trackpad: { id: "trackpad", name: "Trackpad Test", numbers: [], kind: "code" },
  reel: {
    id: "reel",
    kind: "code",
    name: "Reel",
    what: "Frame-exact recorder for web animations. Records load-ins to 4K video.",
    stack: "TypeScript, Playwright, ffmpeg",
    numbers: [{ label: "Max output", value: "4K 60" }],
  },
  openwhip: {
    id: "openwhip",
    kind: "code",
    name: "OpenWhip",
    what: "Whip Claude into shape. A tray app.",
    stack: "Electron, npm",
    numbers: [],
  },
};

// ---------- Art ----------

export type Track = {
  id: string;
  title: string;
  artist: string;
  file: string;
  cover: string;
  duration: number;
  durationLabel: string;
  year: number;
  // false until he confirms it's his and shareable; hide those with .filter((t) => t.confirmed)
  confirmed: boolean;
  note?: string;
};

const allTracks: Track[] = [
  {
    id: "nocturne-for-absent-things",
    title: "Nocturne for Absent Things",
    artist: "Augustas Armalis",
    file: "/content/music/nocturne-for-absent-things.mp3",
    cover: "/content/music/nocturne-for-absent-things.jpg",
    duration: 191,
    durationLabel: "3:11",
    year: 2026,
    confirmed: true,
    note: "Orchestral nocturne, written for the novel",
  },
  {
    id: "afterlight",
    title: "Afterlight",
    artist: "Augustas Armalis",
    file: "/content/music/afterlight.m4a",
    cover: "/content/music/afterlight.jpg",
    duration: 403,
    durationLabel: "6:43",
    year: 2026,
    confirmed: false,
    note: "The novel's ending piece",
  },
];
// To hide unconfirmed pieces: allTracks.filter((t) => t.confirmed)
export const tracks: Track[] = allTracks;

export const art = {
  // null until the real link is in: the Spotify button stays hidden
  spotify: { label: "Spotify", href: null as string | null },
};

export const novel = {
  title: "Žiemos naktys šviesesnės",
  author: "Augustas Armalis",
  illustrator: "Motiejus Varnauskas",
  years: "2025–2027",
  cover: "/content/novel/cover.jpg",
  logo: "/content/novel/logo.png",
  // the full text is large, so the app fetches it when it opens
  src: "/content/novel.json",
};

// ---------- About ----------

export const spec: { label: string; value: string }[] = [
  { label: "Based in", value: "Kaunas, Lithuania" },
  { label: "Work", value: "Sellify, Kaching" },
  { label: "Studio", value: "Larpo" },
  { label: "Piano", value: "11 years" },
  { label: "X", value: "@augustasdesign" },
];

// ---------- Contact ----------

// The one email address. null until it's decided: the UI shows a placeholder.
export const CONTACT_EMAIL: string | null = null;

// Every channel. href null means "not filled in yet": the UI still shows the row,
// pointing at "#" so it looks finished, and the real link drops in here later.
export type Channel = {
  id: "email" | "x" | "linkedin" | "larpo" | "instagram" | "instagramStudio" | "github" | "spotify";
  label: string;
  value: string;
  href: string | null;
};
export const CONTACTS: Record<Channel["id"], Channel> = {
  x: { id: "x", label: "X", value: "@augustasdesign", href: "https://x.com/augustasdesign" },
  linkedin: { id: "linkedin", label: "LinkedIn", value: "armaugustas", href: "https://www.linkedin.com/in/armaugustas" },
  larpo: { id: "larpo", label: "Larpo", value: "larpo.studio", href: "https://larpo.studio" },
  instagramStudio: { id: "instagramStudio", label: "Instagram", value: "@larpo.studio", href: "https://instagram.com/larpo.studio" },
  // placeholders until he confirms them (value is display only, href stays null)
  email: { id: "email", label: "Email", value: CONTACT_EMAIL ?? "Email", href: CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null },
  instagram: { id: "instagram", label: "Instagram", value: "Personal", href: null },
  github: { id: "github", label: "GitHub", value: "GitHub", href: null },
  spotify: { id: "spotify", label: "Spotify", value: "Augustas Armalis", href: null },
};
export const contactList: Channel[] = Object.values(CONTACTS);
export const bookCall = { label: "Book a call", href: "https://cal.com/larpo/15min", sub: "15 min on Cal.com" };

// ---------- Desktop items (right-hand column, like files on a Mac desktop) ----------

export type DeskItem = {
  id: string;
  name: string;
  kind: "folder" | "app" | "doc" | "image";
  // optional artwork in place of the app icon
  art?: string;
  // what opens on double-click: an app, or a Quick Look of a document or image
  open: { app: AppId } | { look: "resume" | "image"; src?: string };
};
// Projects leads the column: it's the way into the work.
export const desktopItems: DeskItem[] = [
  { id: "projects", name: "Projects", kind: "folder", open: { app: "projects" } },
  { id: "games", name: "Games", kind: "folder", open: { app: "games" } },
  { id: "resume", name: "Résumé.pdf", kind: "doc", open: { look: "resume" } },
  { id: "novel", name: "Žiemos naktys šviesesnės", kind: "app", art: "/content/novel/logo.png", open: { app: "novel" } },
  { id: "cover", name: "Cover.jpg", kind: "image", open: { look: "image", src: "/content/novel/cover.jpg" } },
];

// ---------- Finder: the folders, the same everywhere (Finder windows, Spotlight, the phone's Files) ----------

export type FinderItem = {
  id: string;
  name: string;
  // shown under the name and in the Kind column
  kind: string;
  // what opens: an app, a Quick Look, or a track in Music
  app?: AppId;
  look?: { type: "resume" | "image"; src?: string };
  track?: string;
  // artwork in place of an app icon
  art?: string;
};
export type PlaceId = "projects" | "games" | "music" | "photos" | "documents";
const kindOf = (a: AppId) => {
  const p = projects[a];
  if (!p) return "Application";
  if (p.kind === "case") return "Case study";
  if (p.kind === "code") return "Repository";
  return p.link ? "Website" : "Venture";
};
const appItem = (a: AppId, kind = kindOf(a)): FinderItem => ({ id: a, name: apps[a].title, kind, app: a });
export const places: { id: PlaceId; title: string; groups: { title?: string; items: FinderItem[] }[] }[] = [
  { id: "projects", title: "Projects", groups: projectGroups.map((g) => ({ title: g.title, items: g.apps.map((a) => appItem(a)) })) },
  { id: "games", title: "Games", groups: [{ items: gameApps.map((a) => appItem(a, "Game")) }] },
  {
    id: "music",
    title: "Music",
    groups: [
      { title: "Recordings", items: tracks.map((t) => ({ id: t.id, name: t.title, kind: `Audio, ${t.durationLabel}`, track: t.id, art: t.cover })) },
      { title: "Apps", items: [appItem("records"), appItem("piano")] },
    ],
  },
  { id: "photos", title: "Photos", groups: [{ items: [appItem("shots", "Album"), appItem("gallery", "Album")] }] },
  {
    id: "documents",
    title: "Documents",
    groups: [
      {
        items: [
          { id: "resume", name: "Résumé.pdf", kind: "PDF document", look: { type: "resume" } },
          { id: "novel", name: novel.title, kind: "Book", app: "novel", art: novel.logo },
          { id: "cover", name: "Cover.jpg", kind: "JPEG image", look: { type: "image", src: novel.cover }, art: novel.cover },
        ],
      },
    ],
  },
];
