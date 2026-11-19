import { Geist } from "next/font/google";

// Geist, his brand typeface, for everything the 3D world draws: the loader,
// the floating glass controls, captions and the display's lock screen.
export const geist = Geist({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-geist" });

// Family string for canvas text (the lock screen, painted captions).
export const GEIST = `${geist.style.fontFamily}, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;

// Body and display tracking, in em.
export const TRACK = { body: "-0.015em", display: "-0.04em" };

// Resolves once Geist can be drawn into a canvas (or after a short wait).
export function geistReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  const want = [`500 20px ${geist.style.fontFamily}`, `600 20px ${geist.style.fontFamily}`];
  return Promise.race([Promise.all(want.map((f) => document.fonts.load(f))).then(() => undefined), new Promise<void>((r) => window.setTimeout(r, 2500))]).catch(() => undefined);
}
