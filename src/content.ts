import ownMedia from "./media.json";
import workMedia from "./work.json";
// Everything visible on the site lives in this one file.
// Real names and facts only; where something isn't known yet, leave it out.
// Never put private details (email, phone, address) here.

// The 3D intro still hands the screen over with one of these (which object on the desk was picked). The OS itself
// has one desktop and ignores which.
export type UserId = "engineer" | "founder" | "art";

export type AppId =
  // Finder folders, and the apps that stand on their own
  | "projects" | "games" | "shots" | "taste" | "kit"
  // Projects: what he founded and runs
  | "larpo" | "lunor" | "capto" | "contles" | "filzy" | "filzymovie"
  // Lab: small tools, each a folder that opens into its own store page
  | "rug" | "slidepad" | "openwhip"
  // Coming soon (greyed out, not opened)
  | "cortex"
  // Games
  | "doom" | "blocks"
  // Music, writing, pictures
  | "records" | "piano" | "novel" | "gallery" | "notes"
  // System
  | "about" | "contact" | "terminal" | "game" | "settings" | "trash" | "launchpad" | "browser";

export const owner = {
  name: "Augustas",
  role: "Design engineer and founder",
  city: "Kaunas, Lithuania",
  x: { label: "@augustasdesign", href: "https://x.com/augustasdesign" },
  studio: { label: "webstern.co", href: "https://webstern.co/" },
};

export type Wallpaper = { src: string; by: string; href: string; dark: boolean; name?: string; phone?: string };

// Every desktop picture, in one set; the phone uses its own portrait crop where there is one ("phone"). The Mac
// starts on Foggy Sunrise (the 3D display's lock face shows the same picture), the phone on Golden Peaks.
// "live:music" is the audio-reactive shader.
const W = (file: string, name: string, by: string, id: string, dark: boolean): Wallpaper => ({
  src: `/wallpapers/${file}.webp`,
  phone: `/wallpapers/${file}-phone.webp`,
  name,
  by,
  href: `https://unsplash.com/photos/${id}`,
  dark,
});
export const wallpapers: Wallpaper[] = [
  { src: "/wallpapers/founder-foggy-sunrise.webp", name: "Foggy Sunrise", by: "Zetong Li", href: "https://unsplash.com/photos/MaeshPdBGV4", dark: true },
  W("golden-peaks", "Golden Peaks", "Daniil Silantev", "ou_9KZ6BJ-0", true),
  W("davos-mist", "Davos Mist", "Dario Jud", "8xXFONfEUtA", false),
  W("braies", "Braies", "Intricate Explorer", "gjI-YoxuFys", true),
  W("shoreline", "Shoreline", "Hameen Reynolds", "zWFa7mlQAYk", false),
  W("ocean-wave", "Ocean Wave", "Ivan Bandura", "_cyiEwMnGM4", true),
  W("sagres", "Sagres", "Bernd Dittrich", "ELGDJBMKNMI", true),
  W("dunes-night", "Dunes at Night", "Tim de Groot", "yNGQ830uFB4", true),
  { src: "live:music", name: "Live", by: "Live", href: "", dark: true },
  { src: "/wallpapers/founder-mountain-glow.webp", name: "Mountain Glow", by: "Urban Vintage", href: "https://unsplash.com/photos/0HF6s01qyIw", dark: true },
  { src: "/wallpapers/founder-uran-wang.webp", name: "Night Blue", by: "Uran Wang", href: "https://unsplash.com/photos/5wDq-27_zKI", dark: true },
  { src: "/wallpapers/engineer-pawel-curves.webp", name: "Curves", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/C6rZgXbNxJk", dark: false },
  { src: "/wallpapers/engineer-joel-filipe.webp", name: "Folds", by: "Joel Filipe", href: "https://unsplash.com/photos/OxeG5GiOiqM", dark: false },
  { src: "/wallpapers/art-tinky-rain-blue.webp", name: "Rain", by: "Tinky", href: "https://unsplash.com/photos/Z9AW35oeFEo", dark: true },
];

// The lock screen sits on this one.
export const loginWallpaper = wallpapers[0];

// The Dock, left to right: his apps, then the system ones after the divider.
export const dockApps: AppId[] = ["projects", "games", "records", "novel", "notes", "shots", "gallery", "piano"];
export const sharedApps: AppId[] = ["contact", "terminal", "settings"];
// The desktop's dock also has the Browser beside them (the phone has a browser of its own).
export const deskSharedApps: AppId[] = ["browser", ...sharedApps];
// Everything that can be opened by name (Apps grid, Spotlight, Terminal).
export const allApps: AppId[] = [...dockApps, "doom", "blocks", "taste", "kit", ...deskSharedApps, "about"];

// The Projects folder, in its groups.
export const projectGroups: { id: "now" | "ventures" | "lab" | "soon"; title: string; apps: AppId[] }[] = [
  { id: "now", title: "Now", apps: ["larpo"] },
  { id: "ventures", title: "Ventures", apps: ["contles", "lunor", "filzy", "capto", "filzymovie"] },
  { id: "lab", title: "Lab", apps: ["rug", "slidepad", "openwhip"] },
  { id: "soon", title: "Coming soon", apps: ["cortex"] },
];
export const labApps: AppId[] = projectGroups[2].apps;
export const soonApps: AppId[] = projectGroups[3].apps;
// everything in the folder that opens (Coming soon doesn't yet)
export const projectApps: AppId[] = projectGroups.filter((g) => g.id !== "soon").flatMap((g) => g.apps);
export const gameApps: AppId[] = ["doom", "blocks"];

type Size = { w: number; h: number };
// The smallest a window may be dragged. Below about 620 to 700px an app changes its layout with container
// queries (the sidebar tucks behind a toolbar button, two columns become one), so these floors are where the
// single-column layout still works.
const MIN_SIZE: Partial<Record<AppId, Size>> = {
  projects: { w: 440, h: 380 },
  games: { w: 440, h: 380 },
  records: { w: 400, h: 540 },
  novel: { w: 420, h: 440 },
  shots: { w: 600, h: 440 },
  gallery: { w: 560, h: 440 },
  settings: { w: 440, h: 420 },
  contact: { w: 420, h: 500 },
  taste: { w: 380, h: 340 },
  kit: { w: 420, h: 340 },
  piano: { w: 560, h: 280 },
  terminal: { w: 440, h: 280 },
  doom: { w: 560, h: 420 },
  blocks: { w: 600, h: 420 },
  about: { w: 300, h: 480 },
  notes: { w: 420, h: 380 },
  trash: { w: 460, h: 320 },
  game: { w: 380, h: 340 },
};
export function minSize(id: AppId): Size {
  const own = MIN_SIZE[id];
  if (own) return own;
  return projects[id] ? { w: 440, h: 440 } : { w: 480, h: 360 };
}

export const apps: Record<AppId, { title: string; size: Size }> = {
  projects: { title: "Projects", size: { w: 980, h: 640 } },
  games: { title: "Games", size: { w: 980, h: 640 } },
  shots: { title: "Shots", size: { w: 1000, h: 660 } },
  taste: { title: "Taste", size: { w: 700, h: 430 } },
  kit: { title: "Kit", size: { w: 480, h: 400 } },
  larpo: { title: "Webstern", size: { w: 900, h: 720 } },
  lunor: { title: "Lunor", size: { w: 900, h: 720 } },
  capto: { title: "Capto", size: { w: 900, h: 720 } },
  contles: { title: "Contles", size: { w: 900, h: 720 } },
  filzy: { title: "Filzy", size: { w: 900, h: 720 } },
  filzymovie: { title: "AFilm", size: { w: 900, h: 720 } },
  rug: { title: "Rug", size: { w: 860, h: 700 } },
  slidepad: { title: "Slidepad", size: { w: 860, h: 700 } },
  openwhip: { title: "Open Whip", size: { w: 860, h: 680 } },
  cortex: { title: "Cortex", size: { w: 600, h: 400 } },
  doom: { title: "DOOM", size: { w: 800, h: 560 } },
  blocks: { title: "Minecruft", size: { w: 920, h: 620 } },
  records: { title: "Records", size: { w: 920, h: 600 } },
  piano: { title: "Piano", size: { w: 760, h: 320 } },
  novel: { title: "Novel", size: { w: 1040, h: 700 } },
  gallery: { title: "Gallery", size: { w: 1040, h: 700 } },
  about: { title: "About Augustas", size: { w: 320, h: 610 } },
  notes: { title: "Notes", size: { w: 760, h: 520 } },
  contact: { title: "Get in Touch", size: { w: 720, h: 640 } },
  terminal: { title: "Terminal", size: { w: 680, h: 440 } },
  browser: { title: "Browser", size: { w: 1080, h: 720 } },
  game: { title: "Catch", size: { w: 460, h: 400 } },
  settings: { title: "System Settings", size: { w: 820, h: 560 } },
  trash: { title: "Trash", size: { w: 620, h: 420 } },
  launchpad: { title: "Apps", size: { w: 0, h: 0 } },
};

// One template for every project page: an App Store-style page with its logo, a button, pictures, the story and
// the facts. Add a project by adding one of these.
export type Project = {
  id: string;
  name: string;
  // one line under the name
  what?: string;
  // the explanation, a paragraph each
  story?: string[];
  role?: string;
  years?: string;
  stack?: string;
  status?: string;
  // the hero picture, then more (screenshots or photos, shown in a row and opened in Quick Look)
  image?: string;
  images?: string[];
  // a film of it working (a file of ours, with its first frame as the poster)
  video?: { src: string; poster: string };
  numbers: { label: string; value: string }[];
  link?: { label: string; href: string };
  // the big button: "Get" (a download or a repository), "Open" (a web app) or "Visit" (a website)
  get?: { label: string; href: string; sub?: string };
  // the live site may be shown inside the window (it allows framing)
  embeddable?: boolean;
  // "store": a Lab tool (an App Store page with a Get button); left out, a project of his own
  kind?: "store";
  // code projects: the public repository, whose files are listed from GitHub
  repo?: string;
  // a line under the facts, e.g. a credit
  footnote?: string;
};

// His studio's latest work, from webstern.co: each case study's own pictures (captured from the site and made with
// `npm run media -- <folder> --set=work` into public/gallery/work, listed in src/work.json), in the site's order. The
// line under each is the site's own tags for the project.
export const webstern = {
  name: "Webstern",
  href: "https://webstern.co/work/",
  projects: [
    { id: "kaching", title: "Kaching", tags: "Full website, design, branding, motion, development, custom, Shopify plugin", href: "https://webstern.co/case-studies/kaching/" },
    { id: "acquisity", title: "Acquisity", tags: "Product design, website, landing, branding, custom, AI SaaS", href: "https://webstern.co/case-studies/acquisity/" },
    { id: "poof", title: "Poof", tags: "Landing page, product design, branding, motion, custom, fintech", href: "https://webstern.co/case-studies/poof/" },
    { id: "god-of-prompt", title: "God of Prompt", tags: "Landing page, website, branding, custom, AI", href: "https://webstern.co/case-studies/god-of-prompt/" },
  ].map((p) => ({
    ...p,
    items: workMedia.photos
      .filter((w) => w.album === p.id)
      .map((w): Media => ({ id: w.id, kind: "photo", title: w.title, src: w.srcs.viewer, thumb: w.srcs.grid, zoom: w.srcs.zoom, placeholder: w.placeholder, w: w.w, h: w.h, credit: { by: p.title, href: p.href, site: "Webstern" } })),
  })),
};

// Every copy the media pipeline made of a picture, found from any one of them: its grid, viewer and zoom sizes and
// its 24 px blur-up. A page given the viewer copy shows the grid one in a thumbnail and the blur while it loads.
export type Copies = { grid: string; viewer: string; zoom: string; placeholder: string };
const copies = new Map<string, Copies>();
for (const m of [...ownMedia.photos, ...workMedia.photos]) {
  const c = { ...m.srcs, placeholder: m.placeholder };
  for (const s of Object.values(m.srcs)) copies.set(s, c);
}
export const copiesOf = (src: string) => copies.get(src) ?? null;

export const shots = {
  handle: "@augustasdesign",
  href: "https://x.com/augustasdesign",
  items: [
    { title: "Kite", src: "/img/shot-kite.webp" },
    { title: "Kestrel", src: "/img/shot-kestrel.webp" },
    { title: "Quorum", src: "/img/shot-quorum.webp" },
    { title: "Kelvane", src: "/img/shot-kelvane.webp" },
    { title: "Tempra", src: "/img/shot-tempra.webp" },
    { title: "Spindle", src: "/img/shot-spindle.webp" },
    { title: "Tandem", src: "/img/shot-tandem.webp" },
    { title: "Kinora", src: "/img/shot-kinora.webp" },
    { title: "Linnet", src: "/img/shot-linnet.webp" },
    { title: "Halyard", src: "/img/shot-halyard.webp" },
    { title: "Ferry", src: "/img/shot-ferry.webp" },
    { title: "Rimeo", src: "/img/shot-rimeo.webp" },
  ],
};

export const taste = {
  rules: ["Cool greys only.", "No pill shapes. Small, even corners.", "Motion needs a reason.", "Regular layouts, new parts.", "Measure. 4px matters."],
  rated: ["Marcel", "rico", "Basit", "Adrian Kuleszo", "Emil Kowalski"],
};

// ---------- Projects: one page each ----------

// His studio. The app keeps its old id ("larpo"): the studio was Larpo until it became Webstern (larpo.studio now
// goes to webstern.co).
const larpo: Project = {
  id: "larpo",
  name: "Webstern",
  what: "A full-stack web partner for SaaS and AI teams.",
  story: [
    "Webstern is my main focus. I reached six figures on my own; now, with a team of three, we aim to do that every year.",
    "We do everything from website design in Figma to coding it: animations, logos and branding, design systems, backend and all the rest, in custom code, shipped in weeks, not months.",
    "Kaching, Acquisity, Poof and God of Prompt are among the teams we've built for. Acquisity came for product design, left with a rebrand, a website and a front end, and still works with us.",
  ],
  role: "Founder, head of design",
  years: "2024 – now",
  status: "Open",
  stack: "Figma, React, Next.js, Motion, Three.js",
  // its best work, from the case studies (the media pipeline's viewer copies; the page finds their smaller ones)
  image: "/gallery/work/poof-02-landing-page-1920.webp",
  images: ["/gallery/work/kaching-04-bundles-app-1920.webp", "/gallery/work/acquisity-01-home-page-1920.webp", "/gallery/work/god-of-prompt-02-home-page-1920.webp", "/gallery/work/kaching-01-home-1920.webp"],
  numbers: [
    { label: "Revenue", value: "6 figures" },
    { label: "Team", value: "3" },
    { label: "Projects", value: "50+" },
  ],
  link: { label: "webstern.co", href: "https://webstern.co/" },
  get: { label: "Visit", href: "https://webstern.co/" },
  embeddable: true,
};

export const projects: Partial<Record<AppId, Project>> = {
  larpo,
  contles: {
    id: "contles",
    name: "Contles",
    what: "Where brands found creators and ran whole campaigns with them.",
    story: [
      "Contles was my biggest startup. Brands found content creators on it and worked with them in one place, from the first application to the finished content and the payment. Some of the biggest Lithuanian and international brands used it.",
      "We built it ourselves, from zero and without investment. It started in the ISM entrepreneurship club and won it. Then Kickstart Lab, where it picked up several wins, three minutes on the main stage of Startup Fair at Litexpo, and the big one: we took part in Rykliai, Lithuania's Shark Tank.",
      "Building it was intense and exciting: a team locked in for months, more mistakes than I can count, and more learned than anywhere else. In the autumn of 2026 we decided to stop and take everything we learned into bigger things.",
    ],
    role: "CEO, product and design",
    years: "Dec 2025 – Sep 2026",
    status: "Closed",
    image: "/img/p/contles-stage.webp",
    images: ["/img/p/contles-ism.webp", "/img/p/contles-team.webp", "/img/p/contles-kickstart.webp", "/img/p/contles-hoodie.webp"],
    numbers: [
      { label: "ISM club", value: "1st" },
      { label: "Idea to main stage", value: "< 6 mo" },
      { label: "Investment", value: "None" },
    ],
    link: { label: "contles.com", href: "https://contles.com" },
    get: { label: "Visit", href: "https://contles.com" },
    footnote: "Photos from contles.com, by the Contles team.",
  },
  lunor: {
    id: "lunor",
    name: "Lunor",
    what: "A library of real Figma designs and coded components.",
    story: [
      "Lunor began with me sharing my own designs. People bought them and used loads of them, which made it a small success of mine and then a proper library: real Figma files and coded components, straight from the workspaces of verified designers.",
      "Over 300 designs so far, from full product screens down to single components, every one editable. Open it, see exactly how it's built, and drop it into your own work.",
      "It brought in my first MRR, almost four figures, and I'm reaching for that and more. I'm rebuilding it right now, and it's going to be huge. More to come.",
    ],
    role: "Founder",
    years: "Oct 2025 – now",
    status: "Being rebuilt",
    stack: "Figma, Next.js, Supabase, Stripe",
    image: "/img/p/lunor-1.webp",
    images: ["/img/p/lunor-2.webp"],
    numbers: [{ label: "Designs", value: "300+" }],
    link: { label: "lunor.design", href: "https://lunor.design" },
    get: { label: "Visit", href: "https://lunor.design" },
    embeddable: true,
  },
  filzy: {
    id: "filzy",
    name: "Filzy",
    what: "Send any file to any device. Free, with no size limit.",
    story: [
      "I got tired of sending big files, so I engineered my own way of moving them between devices. All it needs is an internet connection, and there's no limit on how big a file can be.",
      "It grew into a better WeTransfer, and then into much more: converting, compressing and extracting, the small file jobs everyone runs into.",
      "It's a passion project for everyone's needs, which is why it's completely free.",
    ],
    role: "Founder",
    years: "2026",
    status: "Live",
    stack: "Vite, WebRTC, Cloudflare Workers",
    image: "/img/p/filzy-1.webp",
    images: ["/img/p/filzy-2.webp"],
    numbers: [
      { label: "File size limit", value: "None" },
      { label: "Price", value: "Free" },
    ],
    link: { label: "filzy.site", href: "https://filzy.site" },
    get: { label: "Open", href: "https://filzy.site" },
    embeddable: true,
  },
  capto: {
    id: "capto",
    name: "Capto",
    what: "Captions for short videos, timed to every word.",
    story: [
      "Capto was an evening project that took an unexpected turn into a real product. People needed captions on their videos, so I built a tool that makes them well, free to start.",
      "I trained my own model and engineered custom solutions around it: word-level timing synced to speech, captions sized to read on mute, lossless 4K export and no watermark, in fourteen languages.",
      "It's a fully working tool, open to everyone.",
    ],
    role: "Founder",
    years: "2026",
    status: "Live",
    stack: "Next.js, Cloudflare, own speech model",
    image: "/img/p/capto-1.webp",
    images: ["/img/p/capto-2.webp"],
    numbers: [
      { label: "Languages", value: "14" },
      { label: "Watermark", value: "Never" },
    ],
    link: { label: "capto.video", href: "https://capto.video" },
    get: { label: "Open", href: "https://capto.video" },
    embeddable: true,
  },
  filzymovie: {
    id: "filzymovie",
    name: "AFilm",
    what: "A film and series streaming site with a beautiful interface.",
    story: [
      "AFilm is a little project of mine: find a film or a series and watch it, in an interface I'd want to come back to every evening. Made for everyone to enjoy.",
    ],
    role: "Founder",
    years: "2026",
    status: "Live",
    image: "/img/p/afilm-1.webp",
    images: ["/img/p/afilm-2.webp"],
    numbers: [],
    link: { label: "filzy.site/movie", href: "https://filzy.site/movie" },
    get: { label: "Open", href: "https://filzy.site/movie" },
    embeddable: true,
  },
  // Lab
  rug: {
    id: "rug",
    name: "Rug",
    what: "Tired of your files? Hide them under a rug.",
    story: [
      "Rug lays a real rug on your desktop, above your icons and below every window. It's a true cloth simulation: grab it, drag it around, peel up a corner, fold it over itself.",
      "Lay it over your icons, or drop files onto it, and they're under the rug, leaving little lumps. A pile of files makes a bigger mound. Lift a corner and everything is right where you left it, and it remembers it all after a restart.",
      "Native on macOS (Swift and Metal) and Windows (C# and .NET), with the same physics on both.",
    ],
    stack: "Swift, Metal, C#",
    status: "v1.2.2",
    video: { src: "/lab/rug/rug.mp4", poster: "/lab/rug/rug-poster.webp" },
    numbers: [
      { label: "Runs on", value: "Mac, PC" },
      { label: "Price", value: "Free" },
    ],
    get: { label: "Get", href: "https://github.com/augustas-rug/road-rug", sub: "GitHub" },
    kind: "store",
    repo: "https://github.com/augustas-rug/road-rug",
  },
  slidepad: {
    id: "slidepad",
    name: "Slidepad",
    what: "Your phone is the clicker.",
    story: [
      "Presentation clickers never work when you need them. With Slidepad your phone is all it takes: a laser pointer, your speaker notes, the next slide and the last one.",
      "Share the room and everyone in a group follows along together, each on their own phone. No app, no login, no server: open the site on the computer, scan the code, and present from absolutely anywhere.",
    ],
    stack: "Web, peer to peer",
    status: "Live",
    image: "/img/p/slidepad-1.webp",
    images: ["/img/p/slidepad-phone.webp"],
    numbers: [
      { label: "App to install", value: "None" },
      { label: "Price", value: "Free" },
    ],
    link: { label: "Slidepad", href: "https://armaugustas.github.io/slidepad/" },
    get: { label: "Get", href: "https://armaugustas.github.io/slidepad/", sub: "Web app" },
    kind: "store",
  },
  openwhip: {
    id: "openwhip",
    name: "Open Whip",
    what: "For when your AI refuses to work with you.",
    story: [
      "Sometimes your AI just stops cooperating. Open Whip puts a whip in your menu bar: crack it, and your coding agent gets an interrupt and a few words of encouragement, and goes back to work.",
      "My version of OpenWhip, with a new whip and sounds of its own. On Mac and Windows.",
    ],
    stack: "Electron, npm",
    status: "Lab",
    image: "/img/p/openwhip-1.webp",
    numbers: [{ label: "Install", value: "npm" }],
    get: { label: "Get", href: "https://github.com/GitFrog1111/OpenWhip", sub: "GitHub" },
    kind: "store",
    footnote: "Built on OpenWhip by GitFrog1111.",
  },
};

// Coming soon: a greyed folder with a small popover, nothing to open yet.
export const comingSoon: Partial<Record<AppId, { name: string; line: string; hint: string }>> = {
  cortex: {
    name: "Cortex",
    line: "A brain for your design. It turns any AI-slop design into a beautiful masterpiece.",
    hint: "It might be the biggest thing I've made yet.",
  },
};

// What he is working on now: the widgets and the lock screen show this.
export const mainWork: Project = larpo;


// ---------- Music ----------

export type Track = {
  id: string;
  title: string;
  artist: string;
  // our own audio file; a song without one plays from YouTube
  file?: string;
  cover: string;
  duration: number;
  durationLabel: string;
  year: number;
  // false until he confirms it's his and shareable; hide those with .filter((t) => t.confirmed)
  confirmed: boolean;
  note?: string;
  // where it lives elsewhere
  youtube?: string;
  spotify?: string;
  // newest release, marked in the list
  isNew?: boolean;
};

const allTracks: Track[] = [
  {
    id: "kiss-you",
    title: "Kiss You",
    artist: "Augustas Armalis",
    file: "/content/music/kiss-you.mp3",
    cover: "/content/music/kiss-me.webp",
    duration: 79,
    durationLabel: "1:19",
    year: 2026,
    confirmed: true,
    note: "New song, made with a singer. November 2026",
    isNew: true,
  },
  {
    id: "afterlight",
    title: "Afterlight",
    artist: "Augustas Armalis",
    file: "/content/music/afterlight.m4a",
    cover: "/content/music/afterlight.webp",
    duration: 403,
    durationLabel: "6:43",
    year: 2026,
    confirmed: true,
    note: "Piano and strings, October 2026",
    youtube: "qdfV5Or6A5c",
    spotify: "https://open.spotify.com/track/44ESD1HONDX4kyEf57XerQ",
  },
  {
    id: "nocturne-for-absent-things",
    title: "Nocturne for Absent Things",
    artist: "Augustas Armalis",
    file: "/content/music/nocturne-for-absent-things.mp3",
    cover: "/content/music/nocturne-for-absent-things.webp",
    duration: 191,
    durationLabel: "3:11",
    year: 2026,
    confirmed: true,
    note: "Orchestral nocturne, his first release, August 2026",
    youtube: "8Wnvs_JZqw8",
    spotify: "https://open.spotify.com/track/09ryPwNdhROHzMEDm7On7G",
  },
];
export const tracks: Track[] = allTracks.filter((t) => t.confirmed);
// the ones the player can play itself (a song without a file of ours would play from YouTube)
export const playableTracks: Track[] = tracks.filter((t) => t.file);

export const music = {
  spotify: { label: "Spotify", name: "Augustas Armalis", href: "https://open.spotify.com/artist/1caZzY2xlQW23Xe1DWtw6H" },
  youtube: { label: "YouTube", name: "hollow kid", href: "https://www.youtube.com/@hollowkidsongs" },
  // the note in Records, his own words
  note: [
    "I've played the piano for over twelve years and finished music school. For a long time I kept it to myself.",
    "Now I'm getting serious about it. I compose and write my own scores, and I'm making songs with a singer, played by hand on real instruments. I strip everything back to the simplest notes, the ones that hurt the most.",
  ],
};

// kept for the parts that still read art.spotify
export const art = { spotify: { label: "Spotify", href: music.spotify.href as string | null } };

// ---------- The novel ----------

export const novel = {
  title: "Žiemos naktys šviesesnės",
  // what the title means, for the English pages
  english: "Winter Nights Are Brighter",
  author: "Augustas Armalis",
  illustrator: "Motiejus Varnauskas",
  years: "2025–2027",
  // the short introduction shown before the book opens
  intro: [
    "A novel about growing up. Karolis is fourteen when it begins and eighteen when it ends: an empty house on a rainy evening, a sister leaving for the capital, a best friend, a girl he draws from memory, and a cat that sees him through all of it.",
    "I wrote it out of passion, while I was growing up myself, not after. Most of what happens in it happened. Twenty chapters, illustrated by Motiejus Varnauskas, in Lithuanian.",
  ],
  // the cover as the book shows it (336 px wide, for a 168 pt cover) and as Quick Look opens it; the file to keep is cover.jpg
  cover: "/content/novel/cover-thumb.webp",
  coverFull: "/content/novel/cover.webp",
  logo: "/content/novel/logo.webp",
  // the full text is large, so the app fetches it when it opens
  src: "/content/novel.json",
  // the finished book, as files to take away (Documents)
  epub: "/content/novel/Ziemos_Naktys_Sviesesnes.epub",
  pdf: "/content/novel/Ziemos_Naktys_Sviesesnes.pdf",
};

// ---------- About ----------

export const spec: { label: string; value: string }[] = [
  { label: "Based in", value: "Kaunas, Lithuania" },
  { label: "Studio", value: "Webstern" },
  { label: "Design", value: "Acquisity" },
  { label: "Piano", value: "12+ years" },
  { label: "Photography", value: "8 years" },
  { label: "X", value: "@augustasdesign" },
];

// The longer About ("More Info"). Facts only; nothing private (no age, no school; the email is on Contact only). "Since fifth grade" for
// photography is his own wording, by his choice.
export const about = {
  name: "Augustas Armalis",
  intro: "I design websites and products and build them in code. I run Webstern, a studio for SaaS and AI teams, and I also write music, take photographs and make films.",
  story: "I started in art and drawing. Drawing turned into design, design into a business, and now I'm finding my way back to music. The camera has been there the whole way: photographs since fifth grade, then films I shoot and edit myself.",
  goals: "To build something really big and really good, and to work out how to live a happy, wonderful life.",
  facts: [
    { label: "Based in", value: "Kaunas, Lithuania" },
    { label: "Does", value: "Product design, websites, front end" },
    { label: "Studio", value: "Webstern" },
    { label: "Design lead", value: "Acquisity" },
    { label: "Piano", value: "12+ years" },
    { label: "Photography", value: "8 years, photo and film" },
    { label: "Novel", value: "Žiemos naktys šviesesnės" },
  ],
  tools: [
    { label: "Design", value: "Figma, design systems, brand, motion" },
    { label: "Code", value: "React, Next.js, Tailwind, Motion, Three.js" },
    { label: "Ships on", value: "Cloudflare, Vercel, Supabase" },
    { label: "Music", value: "MuseScore 4, Logic Pro" },
    { label: "Film", value: "Photography, cinematography, drone, video editing" },
    { label: "Agents", value: "Claude Code, Codex" },
  ],
};

// The Résumé (Quick Look on the desktop and in Documents). Add a role or a section by adding a line.
export type ResumeRow = { when: string; title: string; org: string; body: string; app?: AppId };
export const resume = {
  name: "Augustas Armalis",
  title: "Design engineer and founder",
  city: "Kaunas, Lithuania",
  links: [
    { label: "webstern.co", href: "https://webstern.co/" },
    { label: "x.com/augustasdesign", href: "https://x.com/augustasdesign" },
    { label: "linkedin.com/in/armaugustas", href: "https://www.linkedin.com/in/armaugustas" },
  ],
  summary:
    "I design websites and products and build them in code, from the first sketch to launch night. Over two years of design work, a studio of four that I founded, and a startup taken to Lithuania's biggest stages.",
  sections: [
    {
      title: "Experience",
      rows: [
        { when: "2024 – now", title: "Founder, head of design", org: "Webstern", body: "A full-stack web partner for SaaS and AI teams: brand, websites and product, in custom code. Six figures reached alone, and now, with a team of three, the aim is to do that every year.", app: "larpo" },
        { when: "2025 – now", title: "Lead product designer", org: "Acquisity", body: "Over a year leading product design for Acquisity's AI acquisition platform: product, rebrand, website and front end." },
        { when: "2025 – 2026", title: "CEO, product and design", org: "Contles", body: "A creator-marketing platform, built from zero without investment. First at the ISM entrepreneurship club, then Kickstart Lab and Startup Fair, and a place on Rykliai, Lithuania's Shark Tank.", app: "contles" },
      ] as ResumeRow[],
    },
    {
      title: "Products",
      rows: [
        { when: "2025 – now", title: "Lunor", org: "Founder", body: "A library of real Figma designs and coded components. 300+ designs.", app: "lunor" },
        { when: "2026", title: "Filzy", org: "Founder", body: "Free file sending between devices, with no size limit, plus converters and tools.", app: "filzy" },
        { when: "2026", title: "Capto", org: "Founder", body: "Word-timed captions for short video, on a speech model of my own.", app: "capto" },
      ] as ResumeRow[],
    },
  ],
  skills: [
    { label: "Design", value: "Product and interface design, websites, brand, motion, design systems" },
    { label: "Code", value: "TypeScript, React, Next.js, Tailwind, Motion, Three.js, Swift" },
    { label: "Ships on", value: "Cloudflare, Vercel, Supabase, Stripe" },
    { label: "Music", value: "Piano for 12+ years, music school, composing and scoring" },
    { label: "Photo and film", value: "Photography for 8 years, cinematography, drone, video editing" },
    { label: "Languages", value: "Lithuanian, English" },
  ],
};

// The timeline, oldest first. `when` is shown as written.
export type Milestone = { when: string; title: string; body: string; app?: AppId; key?: boolean };
export const timeline: Milestone[] = [
  { when: "2018", title: "The first camera", body: "Photographs from fifth grade on. Later films, a drone and the edit.", app: "gallery" },
  { when: "2024", title: "My own studio", body: "Websites and products for clients, on my own. This is where the first six figures came from.", app: "larpo" },
  { when: "Jun 2025", title: "Acquisity", body: "Product design for an AI acquisition platform. Now I lead it." },
  { when: "Oct 2025", title: "Lunor", body: "My designs, shared. People bought and used loads of them.", app: "lunor" },
  { when: "Dec 2025", title: "Contles begins", body: "Brands and creators in one place. First at the ISM club, then Kickstart Lab, Startup Fair and Rykliai, Lithuania's Shark Tank.", app: "contles", key: true },
  { when: "2026", title: "Capto and Filzy", body: "An evening project that became a product, and a better way to send files.", app: "capto" },
  { when: "Aug 2026", title: "The novel, and a first release", body: "Žiemos naktys šviesesnės is finished. Nocturne for Absent Things comes out on Spotify.", app: "novel", key: true },
  { when: "Aug 2026", title: "Webstern goes live", body: "The studio's new site goes live, with a team of three.", app: "larpo", key: true },
  { when: "Oct 2026", title: "Rug and Afterlight", body: "A rug for your desktop, and a second release.", app: "rug" },
  { when: "Nov 2026", title: "Kiss You", body: "A first song, made with a singer.", app: "records", key: true },
];

// Notes: short, his own voice.
export type Note = { id: string; title: string; date: string; blocks: ({ h: string } | { p: string } | { list: string[] })[] };
export const notes: Note[] = [
  {
    id: "now",
    title: "Now",
    date: "November 2026",
    blocks: [
      { p: "Webstern is the main thing: brand, websites and product for SaaS and AI teams, from zero to launch." },
      { p: "Leading product design at Acquisity." },
      { h: "On the side" },
      { list: ["Making songs with a singer. Kiss You is the first.", "Rebuilding Lunor. It's going to be huge.", "Cortex, a brain for design. Soon."] },
    ],
  },
  {
    id: "taste",
    title: "Taste",
    date: "Brand rules",
    blocks: [
      { p: "I judge by eye, at real size, on the real page." },
      { h: "Rules" },
      {
        list: [
          "Cool greys only.",
          "Light first.",
          "Crisp, short shadows.",
          "Hovers you can barely see.",
          "Leading icons sit inset evenly.",
          "Nothing clipped.",
          "Centre by eye, not by box.",
          "Motion needs a reason.",
          "Measure. 4px matters.",
        ],
      },
      { h: "Never" },
      { list: ["Blobs.", "Glows.", "Eyebrow pills.", "Fake metrics."] },
    ],
  },
  {
    id: "influences",
    title: "Influences",
    date: "A running list",
    blocks: [
      { h: "Music" },
      { p: "Max Richter first, On the Nature of Daylight above all. Arvo Pärt, Górecki, Rachmaninoff, Chopin, Ólafur Arnalds, Sebastian Plano, Laufey, Billie Eilish." },
      { h: "Design" },
      { p: "Linear, Vercel, Raycast, Stripe, Attio." },
      { h: "Film" },
      { p: "Aftersun, Past Lives, Waves, Moonlight, Normal People, Dune." },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    date: "What's on the desk",
    blocks: [
      { h: "Design" },
      { p: "Figma. Geist, Host Grotesk and Aspekta for type. Lucide for icons." },
      { h: "Code" },
      { p: "React, Next.js, Tailwind, Motion, Three.js. Cloudflare, Vercel and Supabase underneath. Claude Code and Codex alongside." },
      { h: "Music" },
      { p: "MuseScore 4 for scores, Logic Pro for the rest. A Rode NT1 into an Audient iD14." },
    ],
  },
];

// ---------- Gallery ----------

// His own photographs and his film, and nothing else: made by scripts/optimize-media.mjs (npm run media) into
// public/gallery/own and listed in src/media.json. The film leads, then the photos, newest first.
export type Media = {
  id: string;
  kind: "photo" | "video";
  title: string;
  // the picture as the viewer shows it (or the film), and the smaller copy for the grid
  src: string;
  thumb: string;
  // films: the first frame and the length
  poster?: string;
  duration?: number;
  credit: { by: string; href: string; site: string };
  // the day it was taken, its size, a 24 px picture shown blurred while it loads, a larger copy fetched only when
  // zoomed in, and a film's small silent loop for its tile
  own?: boolean;
  date?: string;
  w?: number;
  h?: number;
  placeholder?: string;
  zoom?: string;
  preview?: string;
};
const mine: Media[] = [
  ...ownMedia.films.map((f): Media => ({ id: f.id, kind: "video", title: f.title, src: f.src, thumb: f.poster, poster: f.poster, preview: f.preview, duration: f.duration, placeholder: f.placeholder, own: true, date: f.date, w: f.w, h: f.h, credit: { by: "Augustas Armalis", href: "", site: "" } })),
  ...ownMedia.photos.map((p): Media => ({ id: p.id, kind: "photo", title: p.title, src: p.srcs.viewer, thumb: p.srcs.grid, zoom: p.srcs.zoom, placeholder: p.placeholder, own: true, date: p.date, w: p.w, h: p.h, credit: { by: "Augustas Armalis", href: "", site: "" } })),
];

export const gallery = {
  // over My travels, in his words
  intro:
    "Photos and a film from the road. I do this out of passion, and there's much more coming: more clips, more photos. What's here is only a tiny part, around 0.01%, of everything I've shot.",
  media: mine,
  // Design work: a few of the studio's best screens (ids in src/work.json); the rest is on webstern.co
  design: ["poof-02-landing-page", "kaching-04-bundles-app", "acquisity-01-home-page", "god-of-prompt-02-home-page", "kaching-01-home", "acquisity-06-my-day"],
};

// ---------- Contact ----------

// The one email address: mail goes straight to it.
export const CONTACT_EMAIL: string | null = "augustasarmalis@gmail.com";

// Every channel, in the order he gave them: email, X, Instagram, then his studio's site (the main thing), then the
// rest. href null would mean "not filled in yet" (the row points at "#").
export type Channel = {
  id: "email" | "x" | "instagram" | "website" | "linkedin" | "spotify" | "youtube";
  label: string;
  value: string;
  href: string | null;
};
export const CONTACTS: Record<Channel["id"], Channel> = {
  email: { id: "email", label: "Email", value: CONTACT_EMAIL ?? "Email", href: CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : null },
  x: { id: "x", label: "X", value: "@augustasdesign", href: "https://x.com/augustasdesign" },
  instagram: { id: "instagram", label: "Instagram", value: "@augustas_armalis", href: "https://www.instagram.com/augustas_armalis" },
  website: { id: "website", label: "Website", value: "webstern.co", href: "https://webstern.co/" },
  linkedin: { id: "linkedin", label: "LinkedIn", value: "armaugustas", href: "https://www.linkedin.com/in/armaugustas" },
  spotify: { id: "spotify", label: "Spotify", value: "Augustas Armalis", href: "https://open.spotify.com/artist/1caZzY2xlQW23Xe1DWtw6H" },
  youtube: { id: "youtube", label: "YouTube", value: "hollow kid", href: "https://www.youtube.com/@hollowkidsongs" },
};
export const contactList: Channel[] = Object.values(CONTACTS);
// a call: booked on the studio's own site
export const bookCall = { label: "Book a call", href: "https://webstern.co/intro/#book", sub: "On webstern.co" };

// ---------- Desktop items (right-hand column, like files on a Mac desktop) ----------

export type DeskItem = {
  id: string;
  name: string;
  kind: "folder" | "app" | "doc" | "image";
  // optional artwork in place of the app icon
  art?: string;
  // a small copy of an image file for its icon (the icon is 60 px; the file can be megabytes)
  thumb?: string;
  // the badge on a document icon (PDF when left out)
  ext?: string;
  // what opens on double-click: an app, a Quick Look of a document or image, or a page in the Browser
  open: { app: AppId } | { look: "resume" | "image"; src?: string } | { url: string };
};
// The Easter egg document opens this in the Browser. You know the one.
export const EASTER_EGG = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0";
// Projects leads the column: it's the way into the work.
export const desktopItems: DeskItem[] = [
  { id: "projects", name: "Projects", kind: "folder", open: { app: "projects" } },
  { id: "games", name: "Games", kind: "folder", open: { app: "games" } },
  { id: "resume", name: "Résumé.pdf", kind: "doc", open: { look: "resume" } },
  { id: "novel", name: "Žiemos naktys šviesesnės", kind: "app", art: "/content/novel/logo.webp", open: { app: "novel" } },
  { id: "cover", name: "Cover.jpg", kind: "image", thumb: "/content/novel/cover-thumb.webp", open: { look: "image", src: "/content/novel/cover.webp" } },
  { id: "easter", name: "Easter egg", kind: "doc", ext: "MOV", open: { url: EASTER_EGG } },
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
  // a file that downloads, or a note that opens in Notes
  download?: string;
  note?: string;
  // the badge on a document icon
  ext?: string;
  // artwork in place of an app icon
  art?: string;
  // drawn as a folder (Lab tools), or greyed with a popover and nothing to open (Coming soon)
  folder?: boolean;
  soon?: boolean;
};
export type PlaceId = "projects" | "games" | "music" | "photos" | "documents";
const kindOf = (a: AppId) => {
  const p = projects[a];
  if (!p) return "Application";
  if (p.kind === "store") return p.repo ? "Folder, on GitHub" : "Folder";
  return p.link ? "Website" : "Venture";
};
const appItem = (a: AppId, kind = kindOf(a)): FinderItem => ({ id: a, name: apps[a].title, kind, app: a });
const projectItem = (a: AppId): FinderItem =>
  soonApps.includes(a) ? { id: a, name: apps[a].title, kind: "Coming soon", soon: true, folder: true } : { ...appItem(a), folder: labApps.includes(a) || undefined };
export const places: { id: PlaceId; title: string; groups: { title?: string; items: FinderItem[] }[] }[] = [
  { id: "projects", title: "Projects", groups: projectGroups.map((g) => ({ title: g.title, items: g.apps.map(projectItem) })) },
  { id: "games", title: "Games", groups: [{ items: gameApps.map((a) => appItem(a, "Game")) }] },
  {
    id: "music",
    title: "Music",
    groups: [
      { title: "Recordings", items: tracks.map((t) => (t.file ? { id: t.id, name: t.title, kind: `Audio, ${t.durationLabel}`, track: t.id, art: t.cover } : { id: t.id, name: t.title, kind: `Video, ${t.durationLabel}`, app: "records" as AppId, art: t.cover })) },
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
          { id: "novel-epub", name: "Žiemos naktys šviesesnės.epub", kind: "EPUB, 4.4 MB", download: novel.epub, ext: "EPUB" },
          { id: "novel-pdf", name: "Žiemos naktys šviesesnės.pdf", kind: "PDF, 9.7 MB", download: novel.pdf, ext: "PDF" },
          { id: "brand-rules", name: "Brand rules", kind: "Note", note: "taste", ext: "TXT" },
          { id: "cover", name: "Cover.jpg", kind: "JPEG image", look: { type: "image", src: novel.coverFull }, art: novel.cover },
        ],
      },
    ],
  },
];
