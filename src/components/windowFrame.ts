// Moving and resizing a desktop window: one implementation for app windows and Quick Look.
//
// The pointer is captured on the element it went down on, so the gesture keeps going over iframes, over other
// windows and off the edge of the page. While it runs, <html> carries .win-busy: every iframe stops taking pointer
// events (a live site can't swallow the move) and the cursor stays the gesture's cursor wherever it goes. Moves are
// coalesced to one paint per animation frame, and the caller writes that paint straight to the element (a
// transform or a style), so React hears nothing until the pointer lets go.

export type Rect = { left: number; top: number; w: number; h: number };
export type Size = { w: number; h: number };
export type Bounds = { left: number; top: number; right: number; bottom: number };

export const EDGES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
export type Edge = (typeof EDGES)[number];

export const EDGE_CURSOR: Record<Edge, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

// Hit zones on the frame, not on the content: edges reach 6px outside the window and 2px in, corners are 18px
// squares reaching 6px outside, so they cover the 20px rounded corner's curve (about 6px in along the diagonal).
// They sit above the content, so an iframe under the rim never gets the pointer first.
export const EDGE_ZONE: Record<Edge, string> = {
  n: "left-[12px] right-[12px] -top-[6px] h-[8px]",
  s: "left-[12px] right-[12px] -bottom-[6px] h-[8px]",
  e: "top-[12px] bottom-[12px] -right-[6px] w-[8px]",
  w: "top-[12px] bottom-[12px] -left-[6px] w-[8px]",
  ne: "-right-[6px] -top-[6px] h-[18px] w-[18px]",
  nw: "-left-[6px] -top-[6px] h-[18px] w-[18px]",
  se: "-right-[6px] -bottom-[6px] h-[18px] w-[18px]",
  sw: "-left-[6px] -bottom-[6px] h-[18px] w-[18px]",
};

/** Keep a rect inside bounds: never smaller than min, never larger than max or the bounds themselves. */
export function clampMove(r: Rect, b: Bounds): Rect {
  const left = Math.min(Math.max(r.left, b.left), Math.max(b.left, b.right - r.w));
  const top = Math.min(Math.max(r.top, b.top), Math.max(b.top, b.bottom - r.h));
  return { ...r, left, top };
}

/** The frame an edge or corner drag gives: the opposite side stays put, sizes stay within min, max and bounds. */
export function resizeRect(r0: Rect, edge: Edge, dx: number, dy: number, min: Size, max: Size, b: Bounds): Rect {
  const r = { ...r0 };
  const right = r0.left + r0.w;
  const bottom = r0.top + r0.h;
  if (edge.includes("e")) r.w = Math.min(max.w, b.right - r0.left, Math.max(min.w, r0.w + dx));
  if (edge.includes("w")) {
    r.w = Math.min(max.w, right - b.left, Math.max(min.w, r0.w - dx));
    r.left = right - r.w;
  }
  if (edge.includes("s")) r.h = Math.min(max.h, b.bottom - r0.top, Math.max(min.h, r0.h + dy));
  if (edge.includes("n")) {
    r.h = Math.min(max.h, bottom - b.top, Math.max(min.h, r0.h - dy));
    r.top = bottom - r.h;
  }
  return r;
}

/**
 * Run one pointer gesture from a pointerdown. onFrame gets the total movement since the press, at most once per
 * animation frame; onEnd gets the last movement once the pointer is up (or the gesture is cancelled).
 * With a threshold, nothing happens until the pointer has travelled that far: a plain click (or a double click)
 * on a title bar stays a click, because the pointer is only captured once it is clearly a drag.
 */
export function pointerGesture(
  e: React.PointerEvent | PointerEvent,
  cursor: string,
  onFrame: (dx: number, dy: number) => void,
  onEnd: (dx: number, dy: number) => void,
  threshold = 0,
) {
  const el = e.currentTarget as HTMLElement;
  const id = e.pointerId;
  const sx = e.clientX;
  const sy = e.clientY;
  let dx = 0;
  let dy = 0;
  let raf = 0;
  let started = false;
  const root = document.documentElement;
  const start = () => {
    started = true;
    try {
      el.setPointerCapture(id);
    } catch {
      // a synthetic or already-released pointer: the window listeners below still carry the gesture
    }
    root.classList.add("win-busy");
    root.style.setProperty("--win-cursor", cursor);
    getSelection()?.removeAllRanges();
  };
  if (threshold <= 0) start();
  const paint = () => {
    raf = 0;
    onFrame(dx, dy);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    dx = ev.clientX - sx;
    dy = ev.clientY - sy;
    if (!started) {
      if (Math.hypot(dx, dy) < threshold) return;
      start();
    }
    ev.preventDefault();
    if (!raf) raf = requestAnimationFrame(paint);
  };
  let done = false;
  const end = (ev: PointerEvent) => {
    if (done || (ev.pointerId !== undefined && ev.pointerId !== id)) return;
    done = true;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
    el.removeEventListener("lostpointercapture", end);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!started) return;
    root.classList.remove("win-busy");
    root.style.removeProperty("--win-cursor");
    try {
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    } catch {
      // already released
    }
    onEnd(dx, dy);
  };
  // captured events are dispatched to el and bubble to window, so listening on window (capture phase) hears them
  // whether or not the capture took
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  el.addEventListener("lostpointercapture", end);
}
