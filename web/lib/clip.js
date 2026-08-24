/* Булевы операции и эквидистанта над полигонами. Обёртка над Clipper.
   Полигон здесь — {outer: [{x,y}...], holes: [[{x,y}...]]}. */
import ClipperLib from './clipper/clipper.module.js';
import { area, orient, centroid } from './poly.js';
export { area, orient, centroid };

const K = 100000;
const toPath = ring => ring.map(p => ({ X: Math.round(p.x * K), Y: Math.round(p.y * K) }));
const fromPath = path => path.map(p => ({ x: p.X / K, y: p.Y / K }));

const pathsOf = polys => polys.flatMap(p => { const o = orient(p); return [toPath(o.outer), ...o.holes.map(toPath)]; });

/* PolyTree -> список полигонов с дырками */
function fromTree(node, out = []) {
  for (const child of node.Childs()) {
    const poly = { outer: fromPath(child.Contour()), holes: [] };
    for (const h of child.Childs()) {
      poly.holes.push(fromPath(h.Contour()));
      fromTree(h, out);                       // острова внутри дырки — свои полигоны
    }
    out.push(poly);
  }
  return out;
}

function run(op, subject, clip) {
  const c = new ClipperLib.Clipper();
  c.AddPaths(pathsOf(subject), ClipperLib.PolyType.ptSubject, true);
  if (clip) c.AddPaths(pathsOf(clip), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(op, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromTree(tree);
}

export const intersect = (a, b) => run(ClipperLib.ClipType.ctIntersection, a, b);
export const subtract  = (a, b) => run(ClipperLib.ClipType.ctDifference, a, b);
export const union     = a      => run(ClipperLib.ClipType.ctUnion, a, null);

/* delta > 0 — наружу, delta < 0 — внутрь. Clipper сам разбирается с
   самопересечениями, поэтому вдвигать можно на сколько угодно. */
export function offset(polys, delta, round = true) {
  const co = new ClipperLib.ClipperOffset(4, 0.02 * K);
  co.AddPaths(pathsOf(polys),
    round ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * K);
  return fromTree(tree);
}

/* План мениска: эффективная ширина подъёма и кольца от края внутрь.
   Считается один раз при запекании — в отрисовке Clipper уже не нужен.

   full=true берёт вместо заданной ширины наибольшую, на которую ячейку
   вообще удаётся вдвинуть. Это нужно перелитой эмали: купол должен расти
   до средней линии ячейки, иначе кольца кончатся на ободке и середина
   останется плоским блином. */
export function meniscusPlan(poly, width, steps, full = false) {
  if (full) {
    let lo = 0, hi = width;
    while (offset([poly], -hi).length && hi < 100) hi *= 2;
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (offset([poly], -m).length) lo = m; else hi = m; }
    width = lo * 0.98;
  }
  let w = width, inner = offset([poly], -w);
  for (let i = 0; i < 8 && !inner.length && w > 1e-4; i++) { w *= 0.5; inner = offset([poly], -w); }
  if (!inner.length) return { w: 0, scale: 0, bands: [[poly]] };
  const bands = [];
  let prev = [poly];
  for (let i = 1; i <= steps; i++) {
    const next = offset([poly], -i * w / steps);
    bands.push(next.length ? subtract(prev, next) : prev);
    if (!next.length) return { w, scale: w / width, bands };
    prev = next;
  }
  bands.push(prev);
  return { w, scale: w / width, bands };
}

export function inside(pt, ring) {
  return ClipperLib.Clipper.PointInPolygon(
    { X: Math.round(pt.x * K), Y: Math.round(pt.y * K) }, toPath(ring)) !== 0;
}
