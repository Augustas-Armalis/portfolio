// The Minecruft wordmark: its own pixel lettering (5 by 7 cells, rounded), a sky-to-white face with a darker
// underside, drawn as SVG so it stays sharp at any size. Original artwork; no other game's logo or letters.

const GLYPHS: Record<string, string[]> = {
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

export function Wordmark({ word = "MINECRUFT", cell = 6, className = "" }: { word?: string; cell?: number; className?: string }) {
  const gap = 1;
  let x = 0;
  const cells: { x: number; y: number }[] = [];
  for (const ch of word) {
    const g = GLYPHS[ch];
    if (!g) continue;
    g.forEach((row, y) => [...row].forEach((c, i) => c === "1" && cells.push({ x: x + i, y })));
    x += g[0].length + gap;
  }
  const w = (x - gap) * cell;
  const h = 7 * cell;
  const depth = Math.max(2, Math.round(cell * 0.45));
  const r = cell * 0.18;
  return (
    <svg viewBox={`0 0 ${w} ${h + depth}`} width={w} height={h + depth} className={className} role="img" aria-label="Minecruft">
      <defs>
        <linearGradient id="mc-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#bfe3ff" />
        </linearGradient>
      </defs>
      {cells.map((c) => (
        <rect key={`d${c.x}-${c.y}`} x={c.x * cell} y={c.y * cell + depth} width={cell} height={cell} rx={r} fill="#2a6fd6" />
      ))}
      {cells.map((c) => (
        <rect key={`f${c.x}-${c.y}`} x={c.x * cell} y={c.y * cell} width={cell} height={cell} rx={r} fill="url(#mc-face)" />
      ))}
    </svg>
  );
}
