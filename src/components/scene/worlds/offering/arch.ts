import * as THREE from "three";

// The outline every doorway in the journey is cut to (worlds/portal.tsx draws its window by the same line): straight
// sides up to the springing, then a pointed arch, each side an arc struck from the far springing, meeting in the point.
// h runs 0 at the springing to 1 at the point; the half width there is half * (2 sqrt(1 - 0.75 h h) - 1).
export const pointedHalf = (half: number, h: number) => half * (2 * Math.sqrt(Math.max(0, 1 - 0.75 * h * h)) - 1);

// A great arch as one solid: two piers and the arch over them, a band `t` thick all round the opening (half width
// `half`, springing at y = 0, its point `rise` over that, its piers going down to `foot`), `depth` through, in the XY
// plane and centred through its depth. The opening it leaves is exactly the pointed doorway above.
export function archBand(half: number, rise: number, foot: number, t: number, depth: number, n = 28) {
  const sh = new THREE.Shape();
  const ow = half + t;
  const orise = rise + t * 1.2;
  // outer line up the left and over, then the inner line back down (the shape is one U: the opening is open at the foot)
  sh.moveTo(-ow, foot);
  sh.lineTo(-ow, 0);
  for (let i = 1; i <= n; i++) {
    const h = i / n;
    sh.lineTo(-pointedHalf(ow, h), orise * h);
  }
  for (let i = n - 1; i >= 0; i--) {
    const h = i / n;
    sh.lineTo(pointedHalf(ow, h), orise * h);
  }
  sh.lineTo(ow, foot);
  sh.lineTo(half, foot);
  sh.lineTo(half, 0);
  for (let i = 1; i <= n; i++) {
    const h = i / n;
    sh.lineTo(pointedHalf(half, h), rise * h);
  }
  for (let i = n - 1; i >= 0; i--) {
    const h = i / n;
    sh.lineTo(-pointedHalf(half, h), rise * h);
  }
  sh.lineTo(-half, 0);
  sh.lineTo(-half, foot);
  sh.lineTo(-ow, foot);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// the sheet that fills such an opening (for a glow set in it)
export function archSheet(half: number, rise: number, foot: number, n = 28) {
  const sh = new THREE.Shape();
  sh.moveTo(-half, foot);
  sh.lineTo(-half, 0);
  for (let i = 1; i <= n; i++) sh.lineTo(-pointedHalf(half, i / n), (rise * i) / n);
  for (let i = n - 1; i >= 0; i--) sh.lineTo(pointedHalf(half, i / n), (rise * i) / n);
  sh.lineTo(half, foot);
  return new THREE.ShapeGeometry(sh, 4);
}
