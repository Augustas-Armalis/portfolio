import * as THREE from "three";
import { GEIST, geistReady } from "./font";

// The display's idle face: a macOS-style lock screen. A wallpaper photo, the
// date, and a large live clock. On the phone it's the iOS-style lock screen.
// Values are written as display (sRGB) colour, like the boot frame.

const WALL = { desktop: "/wallpapers/founder-foggy-sunrise.jpg", mobile: "/wallpapers/golden-peaks-phone.webp" };
const FONT = GEIST;

export function makeLockScreen(mobile: boolean) {
  const W = mobile ? 720 : 1600;
  const H = mobile ? 1510 : 900;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  const img = new Image();
  img.src = mobile ? WALL.mobile : WALL.desktop;
  const draw = () => {
    g.fillStyle = "#1b2230";
    g.fillRect(0, 0, W, H);
    if (img.complete && img.naturalWidth) {
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * s;
      const ih = img.naturalHeight * s;
      g.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    }
    // soft legibility gradient at the top
    const gr = g.createLinearGradient(0, 0, 0, H * 0.55);
    gr.addColorStop(0, "rgba(0,0,0,0.28)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    const now = new Date();
    const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowBlur = 24;
    const u = mobile ? W / 390 : H / 900;
    const track = (px: number, em: number) => ((g as unknown as { letterSpacing: string }).letterSpacing = `${(px * em).toFixed(2)}px`);
    const dateSize = Math.round((mobile ? 18 : 24) * u);
    g.font = `500 ${dateSize}px ${FONT}`;
    track(dateSize, -0.015);
    g.fillText(date, W / 2, (mobile ? 150 : 150) * u);
    const timeSize = Math.round((mobile ? 96 : 156) * u);
    g.font = `600 ${timeSize}px ${FONT}`;
    track(timeSize, -0.045);
    g.fillText(time, W / 2, (mobile ? 245 : 300) * u);
    track(dateSize, -0.015);
    g.shadowBlur = 0;
    // a quiet hint at the bottom
    g.font = `500 ${Math.round((mobile ? 14 : 18) * u)}px ${FONT}`;
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(mobile ? "Tap to unlock" : "Click to start", W / 2, H - (mobile ? 70 : 70) * u);
    // the phone's Dynamic Island, at its real size and place on a 393-point-wide screen
    if (mobile) {
      const s = W / 393;
      const iw = 124 * s;
      const ih = 36 * s;
      g.fillStyle = "#000";
      g.beginPath();
      g.roundRect((W - iw) / 2, 11 * s, iw, ih, ih / 2);
      g.fill();
    }
    tex.needsUpdate = true;
  };
  const ready = new Promise<void>((res) => {
    img.onload = () => {
      draw();
      res();
    };
    img.onerror = () => res();
  });
  draw();
  void geistReady().then(draw);
  const t = window.setInterval(draw, 15000);
  return { tex, ready, dispose: () => window.clearInterval(t) };
}
