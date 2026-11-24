# Augustas OS

The personal site of Augustas Armalis, design engineer and founder from Kaunas: a 3D field with a desk, and a little macOS / iOS-style operating system inside the display.

Live at [augustasarmalis.com](https://augustasarmalis.com).

## Run locally

```bash
bun install
bun run dev
```

## Stack

Next.js (static export), React Three Fiber, Tailwind v4, Motion, Zustand. Deployed to GitHub Pages by `.github/workflows/deploy.yml`.

Asset credits are in [CREDITS.md](CREDITS.md).

## Adding photos and films to the Gallery

Drop the originals in a folder (or in `media/inbox/`, which git ignores) and run:

```bash
bun run media -- "/path/to/folder"
```

`scripts/optimize-media.mjs` only reads the originals. It writes web copies to `public/gallery/own/` and the list of them to `src/media.json`, and the Gallery picks them up as the "My travels" album, newest first.

- **Each photo:** turned upright, with all metadata dropped (no EXIF, no GPS). It's saved as webp at three sizes: 800 px for the grid (aim 80 KB or under), 1920 px for the viewer (400 KB or under), and 3200 px, fetched only when zoomed in. A 24 px copy is inlined as a blur-up placeholder.
- **Each film:** H.264 at 1080p at most, capped at 2.6 Mbit/s, with AAC audio, fast start and no metadata. It also gets a webp poster and a 6-second silent 480p loop for its tile.

Only new or changed files are encoded again; add `--force` to redo everything. Titles come from the filename, or the date for camera names like `IMG_1234`. A better title (and an optional `place`) goes in `scripts/media-captions.json`, keyed by the file's id (`porshe.JPG` is `porshe`).
