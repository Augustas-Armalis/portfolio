// Streamed music: the official YouTube player, embedded, never downloaded or
// rehosted. Two decks (so one recording can leave under the other), each an
// IFrame Player API player on youtube-nocookie.com.
//
// - Nothing is fetched until the first deck is asked to play: the API script
//   and the player frames are loaded lazily, and only after the visitor's
//   first gesture (the music director calls from inside it).
// - A deck is levelled through the player's own API (setVolume), in ramps:
//   there is no way to route a cross-origin frame into the audio graph.
// - The frames stay in the page, in the mini-player (scene/music/MusicDock):
//   the player is shown, small, while it plays.
// - Anything that keeps a deck from playing (the script blocked, the embed
//   refused, autoplay refused, no network) ends in `onFail`, and the director
//   falls back to the music we host.
// - Under ?mute=1 the players are muted and behave as usual otherwise, so
//   states and volumes can be read without a sound being made.

import { audioHushed } from "@/lib/audio";

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  loadVideoById(o: { videoId: string; startSeconds?: number }): void;
  cueVideoById(o: { videoId: string; startSeconds?: number }): void;
  setVolume(v: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData?: () => { video_id?: string; title?: string; author?: string };
  destroy(): void;
};
type YTNS = { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer };
type W = Window & { YT?: YTNS; onYouTubeIframeAPIReady?: () => void };

export type DeckState = "idle" | "loading" | "playing" | "paused" | "buffering" | "ended" | "failed";

let api: Promise<YTNS> | null = null;
function loadApi(): Promise<YTNS> {
  if (api) return api;
  api = new Promise<YTNS>((resolve, reject) => {
    const w = window as W;
    if (w.YT?.Player) return resolve(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT?.Player) resolve(w.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => reject(new Error("the player script was blocked"));
    document.head.appendChild(s);
    window.setTimeout(() => reject(new Error("the player script did not arrive")), 12000);
  });
  // a failed load may be tried again later
  api.catch(() => (api = null));
  return api;
}

// Where the frames live: one node made once and never re-parented by anyone
// but the mini-player (moving a frame in the document reloads it).
let hostEl: HTMLDivElement | null = null;
export function streamHost() {
  if (hostEl) return hostEl;
  hostEl = document.createElement("div");
  hostEl.dataset.stream = "";
  hostEl.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit;background:#000";
  // until the mini-player takes it in, it waits out of the way (still in the page)
  const park = document.createElement("div");
  park.dataset.streamPark = "";
  park.style.cssText = "position:fixed;right:16px;bottom:16px;width:200px;height:113px;opacity:0;pointer-events:none;z-index:-1";
  park.appendChild(hostEl);
  document.body.appendChild(park);
  return hostEl;
}

export type Deck = {
  name: string;
  el: HTMLDivElement;
  state: DeckState;
  videoId: string | null;
  vol: number; // 0..1, where the level is now
  to: number; // 0..1, where it is heading
  want: boolean;
  error: string | null;
  title: string;
  play(videoId: string, start: number): void;
  seek(s: number): void;
  fade(to: number, seconds: number): void;
  stop(fade: number): void;
  pause(): void;
  resume(): void;
  time(): number;
  duration(): number;
  report(): Record<string, unknown>;
  onState: ((d: Deck) => void) | null;
  onFail: ((d: Deck, why: string) => void) | null;
};

const HOST = "https://www.youtube-nocookie.com";
const STATES: Record<number, DeckState> = { [-1]: "loading", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "loading" };

export function makeDeck(name: string): Deck {
  const host = streamHost();
  const el = document.createElement("div");
  el.dataset.deck = name;
  el.style.cssText = "position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease;pointer-events:none";
  host.appendChild(el);
  let player: YTPlayer | null = null;
  let making = false;
  let ready = false;
  let pendingStart = 0;
  let timer = 0; // the level's ramp
  let watch = 0; // waiting for it to start
  let stopT = 0; // pause after a fade-out
  let gen = 0;

  const setVol = (v: number) => {
    d.vol = Math.min(1, Math.max(0, v));
    try {
      player?.setVolume(Math.round(d.vol * 100));
      if (audioHushed()) player?.mute();
      else if (player?.isMuted()) player.unMute();
    } catch {
      /* the frame is not ready for it */
    }
  };
  const fail = (why: string) => {
    window.clearTimeout(watch);
    window.clearInterval(timer);
    window.clearTimeout(stopT);
    d.state = "failed";
    d.error = why;
    d.want = false;
    el.style.opacity = "0";
    delete el.dataset.live;
    try {
      player?.stopVideo();
    } catch {
      /* gone already */
    }
    d.onFail?.(d, why);
  };
  // it must be heard playing within a few seconds of being asked, or the hosted music takes over
  const arm = (ms: number) => {
    window.clearTimeout(watch);
    const g = gen;
    watch = window.setTimeout(() => {
      if (g === gen && d.want && d.state !== "playing") fail(d.state === "buffering" ? "it did not start in time" : "autoplay was refused or the embed did not load");
    }, ms);
  };
  const onState = (code: number) => {
    const st = STATES[code] ?? d.state;
    if (!d.want && (st === "playing" || st === "buffering")) {
      // it came up after it was sent away
      try {
        player?.pauseVideo();
      } catch {
        /* ignore */
      }
      return;
    }
    d.state = st;
    if (st === "playing") {
      window.clearTimeout(watch);
      d.error = null;
      el.style.opacity = "1";
      el.dataset.live = "";
      try {
        d.title = player?.getVideoData?.().title ?? d.title;
      } catch {
        /* no data yet */
      }
    }
    d.onState?.(d);
  };
  const create = (videoId: string, start: number) => {
    making = true;
    const g = gen;
    loadApi()
      .then((YT) => {
        if (player) return;
        const mount = document.createElement("div");
        el.appendChild(mount);
        player = new YT.Player(mount, {
          host: HOST,
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, start: Math.max(0, Math.floor(start)), playsinline: 1, rel: 0, controls: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, origin: window.location.origin, enablejsapi: 1, ...(audioHushed() ? { mute: 1 } : null) },
          events: {
            onReady: () => {
              ready = true;
              making = false;
              el.querySelector("iframe")?.setAttribute("title", "Music player");
              setVol(d.vol);
              if (!d.want) return;
              // asked for something else while it was being made
              if (d.videoId !== videoId || g !== gen) player?.loadVideoById({ videoId: d.videoId!, startSeconds: pendingStart });
              else player?.playVideo();
            },
            onStateChange: (e: { data: number }) => onState(e.data),
            onError: (e: { data: number }) => fail(`the player refused it (error ${e.data})`),
            onAutoplayBlocked: () => fail("autoplay was refused"),
          },
        });
      })
      .catch((e: unknown) => {
        making = false;
        fail(e instanceof Error ? e.message : "the player could not be loaded");
      });
  };

  const d: Deck = {
    name,
    el,
    state: "idle",
    videoId: null,
    vol: 0,
    to: 0,
    want: false,
    error: null,
    title: "",
    onState: null,
    onFail: null,
    play(videoId, start) {
      gen++;
      window.clearTimeout(stopT);
      d.want = true;
      d.error = null;
      const same = d.videoId === videoId && ready && d.state !== "failed" && d.state !== "idle";
      d.videoId = videoId;
      pendingStart = start;
      d.state = same ? d.state : "loading";
      arm(11000);
      if (!player) {
        if (!making) create(videoId, start);
        return;
      }
      if (!ready) return;
      try {
        if (same) {
          // the same recording is still on this deck: go to the place and carry on
          if (Math.abs(player.getCurrentTime() - start) > 4) player.seekTo(start, true);
          player.playVideo();
        } else player.loadVideoById({ videoId, startSeconds: Math.max(0, start) });
      } catch {
        fail("the player could not be reached");
      }
    },
    seek(s) {
      try {
        player?.seekTo(s, true);
      } catch {
        /* ignore */
      }
    },
    fade(to, seconds) {
      window.clearInterval(timer);
      d.to = Math.min(1, Math.max(0, to));
      const from = d.vol;
      if (seconds <= 0.05 || Math.abs(from - d.to) < 0.004) return setVol(d.to);
      const t0 = performance.now();
      timer = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        // (a quarter sine either way: the two decks of a cross-fade hold their sum)
        const e = d.to > from ? Math.sin((k * Math.PI) / 2) : 1 - Math.cos((k * Math.PI) / 2);
        setVol(from + (d.to - from) * e);
        if (k >= 1) window.clearInterval(timer);
      }, 60);
    },
    stop(fade) {
      gen++;
      window.clearTimeout(watch);
      window.clearTimeout(stopT);
      d.want = false;
      d.fade(0, fade);
      el.style.opacity = "0";
      delete el.dataset.live;
      stopT = window.setTimeout(
        () => {
          if (d.want) return;
          try {
            player?.pauseVideo();
          } catch {
            /* ignore */
          }
          if (d.state !== "failed") d.state = player ? "paused" : "idle";
          d.onState?.(d);
        },
        fade * 1000 + 90,
      );
    },
    pause() {
      try {
        player?.pauseVideo();
      } catch {
        /* ignore */
      }
    },
    resume() {
      if (!d.want) return;
      try {
        player?.playVideo();
      } catch {
        /* ignore */
      }
    },
    time() {
      try {
        return player?.getCurrentTime() ?? 0;
      } catch {
        return 0;
      }
    },
    duration() {
      try {
        return player?.getDuration() ?? 0;
      } catch {
        return 0;
      }
    },
    report() {
      let muted: boolean | null = null;
      let api: number | null = null;
      let code: number | null = null;
      try {
        muted = player?.isMuted() ?? null;
        api = player?.getVolume() ?? null;
        code = player?.getPlayerState() ?? null;
      } catch {
        /* not ready */
      }
      return { deck: name, video: d.videoId, state: d.state, code, want: d.want, vol: +d.vol.toFixed(3), to: +d.to.toFixed(3), playerVolume: api, muted, t: +d.time().toFixed(1), error: d.error, title: d.title, frame: !!el.querySelector("iframe"), shown: el.style.opacity };
    },
  };
  return d;
}
