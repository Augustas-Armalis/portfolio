// The mark of Augustas OS: a half-sun on the horizon. It is the small lit world the two kings hold in
// Karalių pasaka, and the line of light the loader opens on. One solid shape, one colour (currentColor).
// The same drawing is public/logo.svg; the boot screen draws it from the numbers in scene/shared.ts (BOOT).
export const MARK_PATH = "M15 36a17 17 0 0 1 34 0zM5.5 41.5h53a2.5 2.5 0 0 1 0 5h-53a2.5 2.5 0 0 1 0-5z";

// `size` is the height of the square the mark sits in; the drawing itself is cropped close, so it fills it.
export function Mark({ size = 16, className = "", title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="3 3 58 58" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path fill="currentColor" d={MARK_PATH} />
    </svg>
  );
}
