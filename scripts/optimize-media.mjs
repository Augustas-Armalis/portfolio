#!/usr/bin/env node
// Turns a folder of photographs and films into web assets for the Gallery, and writes their manifest.
//
//   npm run media -- "/path/to/folder"      (or put the files in media/inbox and run `npm run media`)
//   npm run media -- "/path" --force        (re-encode everything, not only what is new or changed)
//
// The originals are only read, never moved or changed. For every photo (JPG, JPEG, PNG, HEIC, WEBP):
//   - turned upright from its EXIF orientation, then every bit of metadata dropped (no EXIF, no GPS)
//   - grid   (fits 800 px,  webp q78, aim <= 80 KB)    the Library's tiles
//   - viewer (fits 1920 px, webp q82, aim <= 400 KB)   the picture opened
//   - zoom   (fits 3200 px, webp q85)                  loaded only when zoomed in
//   - a 24 px webp, inlined in the manifest, shown blurred while the rest arrives
// For every film (MP4, MOV, M4V): H.264 1080p at most (CRF 26, capped at 2.6 Mbit/s, so about 20 MB a minute; AAC
// 128k, fast start, metadata dropped), a webp
// poster from its first second, and a silent 6 s, 480p loop for its tile.
// Outputs go to public/gallery/own/, the manifest to src/media.json (read by content.ts). The only things kept from a
// file are its pixels, its size and the date it was taken (from EXIF, else the file's own timestamp): never a place.
// Titles come from the filename, or from scripts/media-captions.json where one is written by hand.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ffmpeg = require("ffmpeg-static");

// (fileURLToPath, not .pathname: a folder with a space in its name arrives as %20 otherwise)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const IN = path.resolve(args.find((a) => !a.startsWith("--")) ?? process.env.MEDIA_IN ?? path.join(ROOT, "media/inbox"));
const OUT = path.join(ROOT, "public/gallery/own");
const MANIFEST = path.join(ROOT, "src/media.json");
const CAPTIONS = path.join(ROOT, "scripts/media-captions.json");

const PHOTO = /\.(jpe?g|png|heic|heif|webp|tiff?)$/i;
const FILM = /\.(mp4|mov|m4v)$/i;
const SIZES = [
  { key: "grid", box: 800, q: 78, cap: 80 * 1024 },
  { key: "viewer", box: 1920, q: 82, cap: 400 * 1024 },
  { key: "zoom", box: 3200, q: 85, cap: Infinity },
];

if (!fs.existsSync(IN)) {
  console.error(`No folder at ${IN}. Pass one: npm run media -- "/path/to/folder"`);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const captions = fs.existsSync(CAPTIONS) ? JSON.parse(fs.readFileSync(CAPTIONS, "utf8")) : {};
const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { photos: [], films: [] };
const oldById = new Map([...old.photos, ...old.films].map((m) => [m.id, m]));

// "20230921191431_IMG_2635.JPG" -> "img-2635"; "Kelionė palei nemuną.mp4" -> "kelione-palei-nemuna"
const idOf = (file) =>
  path
    .parse(file)
    .name.replace(/^\d{14}_/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const camera = (file) => /^(\d{14}_)?(IMG|DSC|DJI|PXL|GOPR|MVI)_?\d+$/i.test(path.parse(file).name);
const titleOf = (file) => {
  const name = path.parse(file).name.replace(/^\d{14}_/, "").replace(/[_-]+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const human = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");
const kb = (n) => `${Math.round(n / 1024)} KB`;
const stamp = (f) => {
  const s = fs.statSync(f);
  return `${s.size}:${Math.round(s.mtimeMs)}`;
};
const exifDate = (exif) => {
  const m = exif?.toString("latin1").match(/(\d{4}):(\d\d):(\d\d) \d\d:\d\d:\d\d/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

async function photo(file) {
  const src = path.join(IN, file);
  const id = idOf(file);
  const prev = oldById.get(id);
  if (!force && prev?.stamp === stamp(src) && SIZES.every((s) => fs.existsSync(path.join(ROOT, "public", prev.srcs[s.key])))) return prev;
  const meta = await sharp(src).metadata();
  const date = exifDate(meta.exif) ?? new Date(fs.statSync(src).mtimeMs).toISOString().slice(0, 10);
  // upright first; sharp writes no metadata unless asked, so the copies carry no EXIF and no GPS
  const base = sharp(src, { failOn: "none" }).rotate();
  const srcs = {};
  let w = 0;
  let h = 0;
  for (const s of SIZES) {
    let q = s.q;
    let buf;
    for (;;) {
      const r = await base.clone().resize({ width: s.box, height: s.box, fit: "inside", withoutEnlargement: true }).webp({ quality: q, effort: 5, smartSubsample: true }).toBuffer({ resolveWithObject: true });
      buf = r;
      if (r.data.length <= s.cap || q <= 62) break;
      q -= 4;
    }
    const name = `${id}-${s.box}.webp`;
    fs.writeFileSync(path.join(OUT, name), buf.data);
    srcs[s.key] = `/gallery/own/${name}`;
    if (s.key === "zoom") ({ width: w, height: h } = buf.info);
    console.log(`  ${name}  ${buf.info.width}x${buf.info.height}  q${q}  ${kb(buf.data.length)}`);
  }
  const tiny = await base.clone().resize({ width: 24, height: 24, fit: "inside" }).webp({ quality: 40 }).toBuffer();
  const c = captions[id] ?? {};
  return {
    id,
    kind: "photo",
    title: c.title ?? (camera(file) ? human(date) : titleOf(file)),
    date,
    ...(c.place ? { place: c.place } : {}),
    w,
    h,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    srcs,
    stamp: stamp(src),
  };
}

function film(file) {
  const src = path.join(IN, file);
  const id = idOf(file);
  const prev = oldById.get(id);
  const out = path.join(OUT, `${id}.mp4`);
  if (!force && prev?.stamp === stamp(src) && fs.existsSync(out)) return prev;
  const run = (a) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...a], { stdio: "inherit" });
  console.log(`  ${id}.mp4 (this takes a while)`);
  // at most 1080 lines, even sizes; no metadata, no chapters; the index up front so it starts before it has loaded;
// the rate capped so a busy drone shot cannot balloon the file
  run(["-i", src, "-map_metadata", "-1", "-map_chapters", "-1", "-vf", "scale='trunc(oh*a/2)*2':'min(1080,ih)':flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-maxrate", "2600k", "-bufsize", "5200k", "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", out]);
  run(["-i", src, "-map_metadata", "-1", "-t", "6", "-an", "-vf", "scale='trunc(oh*a/2)*2':480:flags=lanczos,fps=24", "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(OUT, `${id}-preview.mp4`)]);
  const frame = path.join(OUT, `${id}-frame.png`);
  run(["-ss", "1", "-i", src, "-frames:v", "1", "-vf", "scale='trunc(oh*a/2)*2':1080", frame]);
  return { id, src, frame, out };
}

const files = fs.readdirSync(IN).filter((f) => !f.startsWith(".")).sort();
const photos = [];
const films = [];
for (const f of files) {
  if (PHOTO.test(f)) {
    console.log(f);
    photos.push(await photo(f));
  } else if (FILM.test(f)) {
    console.log(f);
    const r = film(f);
    if (r.kind) {
      films.push(r);
      continue;
    }
    const poster = `${r.id}-poster.webp`;
    const img = sharp(r.frame);
    const { width: w, height: h } = await img.metadata();
    fs.writeFileSync(path.join(OUT, poster), await img.clone().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toBuffer());
    const tiny = await img.clone().resize({ width: 24, height: 24, fit: "inside" }).webp({ quality: 40 }).toBuffer();
    fs.rmSync(r.frame);
    const probe = (() => {
      try {
        execFileSync(ffmpeg, ["-i", r.out], { stdio: "pipe" });
      } catch (e) {
        return String(e.stderr);
      }
      return "";
    })();
    const d = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
    const c = captions[r.id] ?? {};
    // the film's own recorded date (creation_time, date only), else the file's timestamp
    const born = (() => {
      try {
        execFileSync(ffmpeg, ["-i", r.src], { stdio: "pipe" });
      } catch (e) {
        return String(e.stderr).match(/creation_time\s*:\s*(\d{4}-\d\d-\d\d)/)?.[1];
      }
    })();
    const date = born ?? new Date(fs.statSync(r.src).mtimeMs).toISOString().slice(0, 10);
    films.push({
      id: r.id,
      kind: "video",
      title: c.title ?? titleOf(f),
      date,
      ...(c.place ? { place: c.place } : {}),
      w,
      h,
      duration: d ? Math.round(+d[1] * 3600 + +d[2] * 60 + +d[3]) : 0,
      placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
      src: `/gallery/own/${r.id}.mp4`,
      preview: `/gallery/own/${r.id}-preview.mp4`,
      poster: `/gallery/own/${poster}`,
      stamp: stamp(r.src),
    });
    for (const n of [`${r.id}.mp4`, `${r.id}-preview.mp4`, poster]) console.log(`  ${n}  ${kb(fs.statSync(path.join(OUT, n)).size)}`);
  }
}
// newest first
const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id));
photos.sort(byDate);
films.sort(byDate);
fs.writeFileSync(MANIFEST, `${JSON.stringify({ photos, films }, null, 2)}\n`);
const total = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`\n${photos.length} photos, ${films.length} films -> public/gallery/own (${(total / 1048576).toFixed(1)} MB), manifest src/media.json`);
