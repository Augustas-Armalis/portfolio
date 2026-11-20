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
  studio: { label: "larpo.studio", href: "https://larpo.studio" },
};

export type Wallpaper = { src: string; by: string; href: string; dark: boolean };

// Every desktop picture, in one set. The first is the default; "live:music" is the audio-reactive shader.
export const wallpapers: Wallpaper[] = [
  { src: "/wallpapers/engineer-joel-filipe.webp", by: "Joel Filipe", href: "https://unsplash.com/photos/OxeG5GiOiqM", dark: false },
  { src: "/wallpapers/engineer-pawel-curves.webp", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/C6rZgXbNxJk", dark: false },
  { src: "/wallpapers/engineer-pawel-structure.webp", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/9T8fywAF54I", dark: false },
  { src: "/wallpapers/engineer-pawel-folds.webp", by: "Pawel Czerwinski", href: "https://unsplash.com/photos/TtAoOVEXgMw", dark: false },
  { src: "/wallpapers/founder-uran-wang.webp", by: "Uran Wang", href: "https://unsplash.com/photos/5wDq-27_zKI", dark: true },
  { src: "/wallpapers/founder-farnaz-kohankhaki.webp", by: "Farnaz Kohankhaki", href: "https://unsplash.com/photos/LuN2RBcXO6w", dark: true },
  { src: "/wallpapers/founder-mountain-sunset.webp", by: "Unsplash", href: "https://unsplash.com/photos/vay2UUzHnfw", dark: true },
  { src: "/wallpapers/founder-foggy-sunrise.webp", by: "Zetong Li", href: "https://unsplash.com/photos/MaeshPdBGV4", dark: true },
  { src: "/wallpapers/founder-mountain-glow.webp", by: "Urban Vintage", href: "https://unsplash.com/photos/0HF6s01qyIw", dark: true },
  { src: "live:music", by: "Live", href: "", dark: true },
  { src: "/wallpapers/art-bernd-dittrich.webp", by: "Bernd Dittrich", href: "https://unsplash.com/photos/wLhmecNUVNc", dark: true },
  { src: "/wallpapers/art-thom-milkovic.webp", by: "Thom Milkovic", href: "https://unsplash.com/photos/1MSHtu4pkBM", dark: true },
  { src: "/wallpapers/art-tinky-rain-blue.webp", by: "Tinky", href: "https://unsplash.com/photos/Z9AW35oeFEo", dark: true },
  { src: "/wallpapers/art-satyajit-rain.webp", by: "Satyajit", href: "https://unsplash.com/photos/3XiPqV2fKeE", dark: true },
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
  larpo: { title: "Larpo", size: { w: 900, h: 720 } },
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

const larpo: Project = {
  id: "larpo",
  name: "Larpo",
  what: "A full-stack website and product design studio for SaaS and AI teams.",
  story: [
    "Larpo is my design studio, and it was my first business. We design and build websites, product interfaces and brands for SaaS and AI teams. Strategy, design, motion and code sit in one team, so a launch takes weeks, not months.",
    "It has earned over six figures, keeps growing, and is now run by a team of four. What you see today is its fourth brand. Each one got sharper as the work did.",
    "Teams come to us for one thing and stay for the rest: Acquisity came for product design and left with a rebrand, a website and a front end, and still works with us.",
  ],
  role: "Founder, head of design",
  years: "Now",
  status: "Taking projects",
  stack: "Figma, React, Next.js, Motion, Three.js",
  image: "/img/p/larpo-1.webp",
  images: ["/img/p/larpo-2.webp"],
  numbers: [
    { label: "Revenue", value: "6 figures" },
    { label: "Team", value: "4" },
    { label: "Brand", value: "4th" },
  ],
  link: { label: "larpo.studio", href: "https://larpo.studio" },
  get: { label: "Visit", href: "https://larpo.studio" },
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
      "We built it ourselves, from zero and without investment. It started in the ISM entrepreneurship club and won it. Then Kickstart Lab, where it picked up several wins, three minutes on the main stage of Startup Fair at Litexpo, and the big one: Rykliai, Lithuania's Shark Tank.",
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
      "I'm rebuilding it right now, and it's going to be huge. More to come.",
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
    video: { src: "/lab/rug/demo.mp4", poster: "/lab/rug/poster.webp" },
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
    id: "kiss-me",
    title: "Kiss Me",
    artist: "Augustas Armalis",
    cover: "/content/music/kiss-me.webp",
    duration: 77,
    durationLabel: "1:17",
    year: 2026,
    confirmed: true,
    note: "New song. A first preview, November 2026",
    youtube: "fUTEPMo2qsk",
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
// the ones the player can play itself (Kiss Me plays from YouTube)
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
  { label: "Studio", value: "Larpo" },
  { label: "Design", value: "Acquisity" },
  { label: "Piano", value: "12+ years" },
  { label: "X", value: "@augustasdesign" },
];

// The longer About ("More Info"). Facts only; nothing private (no age, school, email).
export const about = {
  name: "Augustas Armalis",
  intro: "I'm a design engineer and founder. I design websites and products and build them in code, I run Larpo, a design studio, and I write music.",
  story: "I started in art and drawing. Drawing turned into design, design turned into business, and now I'm finding my way back to music.",
  goals: "To build something really big and really good, and to work out how to live a happy, wonderful life.",
  facts: [
    { label: "Based in", value: "Kaunas, Lithuania" },
    { label: "Does", value: "Product design, websites, front end" },
    { label: "Studio", value: "Larpo" },
    { label: "Design lead", value: "Acquisity" },
    { label: "Piano", value: "12+ years" },
    { label: "Novel", value: "Žiemos naktys šviesesnės" },
  ],
  tools: [
    { label: "Design", value: "Figma, design systems, brand, motion" },
    { label: "Code", value: "React, Next.js, Tailwind, Motion, Three.js" },
    { label: "Ships on", value: "Cloudflare, Vercel, Supabase" },
    { label: "Music", value: "MuseScore 4, Logic Pro" },
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
    { label: "larpo.studio", href: "https://larpo.studio" },
    { label: "x.com/augustasdesign", href: "https://x.com/augustasdesign" },
    { label: "linkedin.com/in/armaugustas", href: "https://www.linkedin.com/in/armaugustas" },
  ],
  summary:
    "I design websites and products and build them in code, from the first sketch to launch night. Over two years of design work, a studio of four that I founded, and a startup taken to Lithuania's biggest stages.",
  sections: [
    {
      title: "Experience",
      rows: [
        { when: "Now", title: "Founder, head of design", org: "Larpo Studio", body: "A full-stack website and product design studio for SaaS and AI teams. My first business: over six figures earned, a team of four, now on its fourth brand.", app: "larpo" },
        { when: "2025 – now", title: "Lead product designer", org: "Acquisity", body: "Over a year leading product design for Acquisity's AI acquisition platform: product, rebrand, website and front end." },
        { when: "2025 – 2026", title: "CEO, product and design", org: "Contles", body: "A creator-marketing platform, built from zero without investment. First at the ISM entrepreneurship club, Kickstart Lab, Startup Fair, Rykliai (Shark Tank Lithuania).", app: "contles" },
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
    { label: "Languages", value: "Lithuanian, English" },
  ],
};

// The timeline, oldest first. `when` is shown as written.
export type Milestone = { when: string; title: string; body: string; app?: AppId; key?: boolean };
export const timeline: Milestone[] = [
  { when: "Jun 2025", title: "Acquisity", body: "Product design for an AI acquisition platform. Now leading it." },
  { when: "Oct 2025", title: "Lunor", body: "My designs, shared. People bought and used loads of them.", app: "lunor" },
  { when: "Dec 2025", title: "Contles begins", body: "Brands and creators in one place. First at the ISM club, then Kickstart Lab, Startup Fair and Rykliai.", app: "contles", key: true },
  { when: "2026", title: "Capto and Filzy", body: "An evening project that became a product, and a better way to send files.", app: "capto" },
  { when: "Aug 2026", title: "The novel, and a first release", body: "Žiemos naktys šviesesnės is finished. Nocturne for Absent Things comes out on Spotify.", app: "novel", key: true },
  { when: "Aug 2026", title: "Larpo, fourth brand", body: "The studio's new site goes live. A team of four.", app: "larpo", key: true },
  { when: "Oct 2026", title: "Rug and Afterlight", body: "A rug for your desktop, and a second release.", app: "rug" },
  { when: "Nov 2026", title: "Kiss Me", body: "A first song, made with a singer.", app: "records", key: true },
];

// Notes: short, his own voice.
export type Note = { id: string; title: string; date: string; blocks: ({ h: string } | { p: string } | { list: string[] })[] };
export const notes: Note[] = [
  {
    id: "now",
    title: "Now",
    date: "November 2026",
    blocks: [
      { p: "Larpo is the main thing: websites, product and brand for SaaS and AI teams, from zero to launch." },
      { p: "Leading product design at Acquisity." },
      { h: "On the side" },
      { list: ["Making songs with a singer. Kiss Me is the first.", "Rebuilding Lunor. It's going to be huge.", "Cortex, a brain for design. Soon."] },
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

// Photos and films, by trip. PLACEHOLDERS until his own arrive: every item is an Unsplash photo or a Mixkit film,
// credited in the viewer. To swap one, change its src (and thumb, poster) and credit; the albums stay as they are.
export type Media = {
  id: string;
  kind: "photo" | "video";
  title: string;
  // the full picture or film, and a small square for the grid
  src: string;
  thumb: string;
  // films: the first frame and the length
  poster?: string;
  duration?: number;
  credit: { by: string; href: string; site: string };
};
export type Album = { id: string; title: string; sub: string; items: string[] };
const unsplash = (photo: string, id: string, title: string, by: string): Media => ({
  id,
  kind: "photo",
  title,
  src: `https://images.unsplash.com/${photo}?w=2400&q=80&auto=format`,
  thumb: `https://images.unsplash.com/${photo}?w=480&h=480&fit=crop&q=70&auto=format`,
  credit: { by, href: `https://unsplash.com/photos/${id}`, site: "Unsplash" },
});
const mixkit = (n: string, title: string, duration: number, page: string): Media => ({
  id: `film-${n}`,
  kind: "video",
  title,
  src: `https://assets.mixkit.co/videos/${n}/${n}-720.mp4`,
  thumb: `/gallery/mixkit-${n}.webp`,
  poster: `/gallery/mixkit-${n}.webp`,
  duration,
  credit: { by: "Mixkit", href: `https://mixkit.co/free-stock-video/${page}/`, site: "Mixkit" },
});
const media: Media[] = [
  unsplash("photo-1494565052307-1e66e072bca6", "wPKTJsihIYw", "Snow road near Mývatn", "Jeremy Bishop"),
  unsplash("photo-1683668608403-bdac56a8abaa", "bINbcn3031o", "The east fjords", "Job Savelsberg"),
  unsplash("photo-1485982353291-4f167f9dee32", "eKfEO0qM1aU", "Ring Road", "Nuno Antunes"),
  unsplash("photo-1517765630897-8eccec28aaeb", "YifNPOb4UhA", "Meðalfell", "Einar H. Reynis"),
  unsplash("photo-1503764833250-3aa553ba3f2b", "PozYb57vV38", "Fog on the pass", "Matthias Heil"),
  unsplash("photo-1752490890976-dc8471357439", "hO4F6nYJ03w", "Highlands", "Stan Jacobs"),
  unsplash("photo-1516833514026-5aa3dc6eeef3", "innb1UEpVZg", "Straight into the mountains", "redcharlie"),
  unsplash("photo-1670331932795-0845cf7e20cb", "x1jAFA-T7GU", "Valley morning", "Kristine Varga"),
  unsplash("photo-1559065188-2537766d864b", "uJIhAvqFJxg", "Peaks after sunset", "Massimiliano Morosinotto"),
  unsplash("photo-1694630515448-344264b30507", "1oGFKEePOFQ", "Last light", "Marek Piwnicki"),
  unsplash("photo-1724420964796-9d5a229728a1", "kQ0LkrVVuv0", "Lake and village", "Seongil Park"),
  unsplash("photo-1738358459010-d9354dfa4769", "UWP6ZzHrqfo", "Snow ridge", "Marek Piwnicki"),
  unsplash("photo-1478512611414-50d132a6dcd3", "ATzEluEgZpw", "Into the cloud", "Matt Sclarandis"),
  unsplash("photo-1647430075466-fd32f97d1338", "RIhZ4zFYBCQ", "Switchbacks in snow", "Datingjungle"),
  unsplash("photo-1724420965567-2199e9d53f05", "PWHEBQS0QXo", "From above", "Seongil Park"),
  unsplash("photo-1701888281351-b9f44b3250bc", "W5ISGAqjAfg", "Shinjuku", "mos design"),
  unsplash("photo-1780631347040-0c5df6053c2f", "2uuaV_fI4LU", "Crossing", "Jezael Melgoza"),
  unsplash("photo-1758881606455-26cc1c2c8de4", "GU8CEZReKxs", "Side street", "Intrepid"),
  unsplash("photo-1746150361967-7c20603d25cd", "XMAbH81gUbQ", "Ramen and neon", "mos design"),
  unsplash("photo-1743328008258-9b995b22bb76", "kYlfHSJVZT4", "Walking home", "mos design"),
  unsplash("photo-1710269954197-b138463df131", "xSJq_ivXjAc", "Back alley", "mos design"),
  unsplash("photo-1758402320417-1a21489e86fa", "T11f_AGNKGg", "After the rain", "Intrepid"),
  unsplash("photo-1494237311986-f5344a7bc2fa", "uPwWP83BCeg", "Grass at sunset", "Jamie Street"),
  unsplash("photo-1752542361803-67aaed92a27f", "_-3P0X11GYI", "Long shadows", "Hyory Liu"),
  unsplash("photo-1533401494430-4ab790a0600f", "P4AQFdHDNkQ", "Still water", "Jeffrey Hamilton"),
  unsplash("photo-1568899240208-27430ba1cacd", "WAQ00FkbA7g", "Sun on the sea", "Dmytro Shchetynin"),
  unsplash("photo-1487322971970-d7ab08ec80e9", "-mCWpK4aLgQ", "Winter sun", "Ales Krivec"),
  unsplash("photo-1745528009908-aac87a43afb3", "GiDqZkXMqVM", "Nida lighthouse", "Nicolás Gutiérrez"),
  unsplash("photo-1601884842017-bf608984963c", "ypA56XUc4dE", "Footprints, Nida", "Gantas Vaičiulėnas"),
  unsplash("photo-1517393537986-7f11137e12c0", "RraKuk4JjEU", "After the sun", "Oliver Conway"),
  unsplash("photo-1480004902249-cdb28d6a01a4", "niYTtTIR-u4", "Desert evening", "Robert Murray"),
  mixkit("52444", "Mountain road at dusk", 13, "flying-over-a-rugged-landscape-with-a-w-highway-traversing-52444"),
  mixkit("4998", "A lake from the air at sunset", 20, "landscape-of-a-large-lake-during-sunset-from-the-air-4998"),
  mixkit("2788", "Cabins in the forest", 19, "aerial-view-of-a-forest-with-cabins-2788"),
  mixkit("52436", "Road through dry hills", 19, "aerial-view-of-an-asphalt-road-surrounded-by-the-mountains-52436"),
];
export const gallery = {
  media,
  albums: [
    { id: "best", title: "Best of", sub: "The ones I keep coming back to", items: ["x1jAFA-T7GU", "film-52444", "W5ISGAqjAfg", "wPKTJsihIYw", "uPwWP83BCeg", "uJIhAvqFJxg", "GiDqZkXMqVM", "film-4998", "bINbcn3031o", "_-3P0X11GYI", "GU8CEZReKxs", "kQ0LkrVVuv0"] },
    { id: "iceland", title: "Iceland", sub: "Along the Ring Road", items: ["wPKTJsihIYw", "bINbcn3031o", "film-52436", "eKfEO0qM1aU", "YifNPOb4UhA", "PozYb57vV38", "hO4F6nYJ03w", "innb1UEpVZg"] },
    { id: "dolomites", title: "Dolomites", sub: "High up in the Alps", items: ["x1jAFA-T7GU", "uJIhAvqFJxg", "1oGFKEePOFQ", "film-2788", "kQ0LkrVVuv0", "UWP6ZzHrqfo", "ATzEluEgZpw", "RIhZ4zFYBCQ", "PWHEBQS0QXo"] },
    { id: "tokyo", title: "Tokyo at night", sub: "Shinjuku, Shibuya, Ikebukuro", items: ["W5ISGAqjAfg", "2uuaV_fI4LU", "GU8CEZReKxs", "XMAbH81gUbQ", "kYlfHSJVZT4", "xSJq_ivXjAc", "T11f_AGNKGg"] },
    { id: "golden", title: "Golden hour", sub: "The best twenty minutes of the day", items: ["uPwWP83BCeg", "_-3P0X11GYI", "P4AQFdHDNkQ", "WAQ00FkbA7g", "-mCWpK4aLgQ", "GiDqZkXMqVM", "ypA56XUc4dE", "RraKuk4JjEU", "niYTtTIR-u4"] },
    { id: "films", title: "Films", sub: "Moving pictures", items: ["film-52444", "film-4998", "film-2788", "film-52436"] },
  ] as Album[],
};

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
  // a small copy of an image file for its icon (the icon is 60 px; the file can be megabytes)
  thumb?: string;
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
  { id: "easter", name: "Easter egg", kind: "doc", open: { url: EASTER_EGG } },
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
          { id: "novel-epub", name: "Žiemos naktys šviesesnės.epub", kind: "EPUB, 4.4 MB", download: novel.epub, ext: "EPUB" },
          { id: "novel-pdf", name: "Žiemos naktys šviesesnės.pdf", kind: "PDF, 9.7 MB", download: novel.pdf, ext: "PDF" },
          { id: "brand-rules", name: "Brand rules", kind: "Note", note: "taste", ext: "TXT" },
          { id: "cover", name: "Cover.jpg", kind: "JPEG image", look: { type: "image", src: novel.coverFull }, art: novel.cover },
        ],
      },
    ],
  },
];
