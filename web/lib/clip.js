/* Булевы операции и эквидистанта над полигонами. Обёртка над Clipper.
   Полигон здесь — {outer: [{x,y}...], holes: [[{x,y}...]]}. */
import ClipperLib from './clipper/clipper.module.js';

const K = 100000;
const toPath = ring => ring.map(p => ({ X: Math.round(p.x * K), Y: Math.round(p.y * K) }));
const fromPath = path => path.map(p => ({ x: p.X / K, y: p.Y / K }));

export function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/* Внешние кольца против часовой, дырки по часовой — этого ждёт Clipper. */
export function orient(poly) {
  const fix = (ring, wantCCW) => (area(ring) < 0) === wantCCW ? ring.slice().reverse() : ring;
  return { outer: fix(poly.outer, true), holes: (poly.holes || []).map(h => fix(h, false)) };
}

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

export function inside(pt, ring) {
  return ClipperLib.Clipper.PointInPolygon(
    { X: Math.round(pt.x * K), Y: Math.round(pt.y * K) }, toPath(ring)) !== 0;
}

export const centroid = ring => {
  let x = 0, y = 0;
  for (const p of ring) { x += p.x; y += p.y; }
  return { x: x / ring.length, y: y / ring.length };
};
