/* Эмаль с мениском.
 *
 * Залитая эмаль смачивает металлическую стенку и лезет по ней вверх:
 * поверхность вогнутая — ниже всего в середине, у стенки поднимается почти
 * до верха перегородки. Именно это даёт узкий изогнутый блик вдоль каждого
 * контура, которого у плоской плитки нет вовсе.
 *
 * Подделывать нормалмапом нельзя: значок вращается, и на скользящих углах
 * подделка развалится. Поэтому геометрия настоящая.
 *
 * Высота зависит только от расстояния до края ячейки, поэтому нормаль
 * считается аналитически — швов между кольцами не видно и сваривать вершины
 * не нужно.
 */
import * as THREE from 'three';
import * as C from './clip.js';

const EPS = 1e-9;

/* Расстояние до ближайшего ребра и направление от него внутрь. */
function distanceField(rings) {
  const seg = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      seg.push(a.x, a.y, b.x - a.x, b.y - a.y);
    }
  return (px, py) => {
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0; i < seg.length; i += 4) {
      const ax = seg[i], ay = seg[i + 1], vx = seg[i + 2], vy = seg[i + 3];
      const L = vx * vx + vy * vy;
      let t = L > EPS ? ((px - ax) * vx + (py - ay) * vy) / L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bx = dx; by = dy; }
    }
    const d = Math.sqrt(best);
    return d > EPS ? [d, bx / d, by / d] : [0, 0, 0];
  };
}

/**
 * Тело эмали одной ячейки: дно, вертикальная боковина и вогнутая крышка.
 *  zBottom — низ (верх пластины)
 *  zFloor  — уровень эмали в середине ячейки
 *  zEdge   — уровень у стенки; rise=0 даёт zEdge=zFloor, rise=1 — верх канта
 *  width   — на какую глубину от стенки идёт подъём
 *  steps   — сколько колец на мениск
 */
export function enamelGeometry(poly, { zBottom, zFloor, zEdge, width, steps = 5 }) {
  const p = C.orient(poly);

  // Узкая ячейка: если вдвинуть на всю ширину мениска нечего, подъём гасим,
  // иначе пальцы и прочая мелочь превратятся в купола.
  let w = width, inner = C.offset([p], -w);
  for (let i = 0; i < 8 && !inner.length && w > 1e-4; i++) { w *= 0.5; inner = C.offset([p], -w); }
  if (!inner.length) w = 0;
  const top = w > 0 ? zFloor + (zEdge - zFloor) * (w / width) : zFloor;

  const H  = d => { const u = w > 0 ? Math.min(1, d / w) : 1; return zFloor + (top - zFloor) * (1 - u) ** 2; };
  const dH = d => { const u = w > 0 ? Math.min(1, d / w) : 1; return u >= 1 ? 0 : -2 * (top - zFloor) * (1 - u) / w; };

  const field = distanceField([p.outer, ...p.holes]);
  const pos = [], nor = [];
  const n3 = new THREE.Vector3();

  const putTop = v => {
    const [d, nx, ny] = field(v.x, v.y);
    const s = -dH(d);
    n3.set(s * nx, s * ny, 1).normalize();
    pos.push(v.x, v.y, H(d));
    nor.push(n3.x, n3.y, n3.z);
  };

  const faces = q => {
    const contour = q.outer.map(v => new THREE.Vector2(v.x, v.y));
    const holes = q.holes.map(h => h.map(v => new THREE.Vector2(v.x, v.y)));
    const all = [contour, ...holes].flat();
    return { tris: THREE.ShapeUtils.triangulateShape(contour, holes), all };
  };

  /* крышка: кольцо за кольцом от края внутрь */
  const rings = [[p]];
  for (let i = 1; i <= steps; i++) rings.push(w > 0 ? C.offset([p], -i * w / steps) : []);
  for (let i = 0; i < steps; i++) {
    const band = rings[i + 1].length ? C.subtract(rings[i], rings[i + 1]) : rings[i];
    for (const q of band) { const { tris, all } = faces(q); for (const t of tris) for (const k of t) putTop(all[k]); }
    if (!rings[i + 1].length) break;
  }
  for (const q of rings[steps]) { const { tris, all } = faces(q); for (const t of tris) for (const k of t) putTop(all[k]); }

  /* дно */
  {
    const { tris, all } = faces(p);
    for (const t of tris) for (const k of [t[2], t[1], t[0]]) {
      pos.push(all[k].x, all[k].y, zBottom); nor.push(0, 0, -1);
    }
  }

  /* боковина: от дна до уровня у стенки. Прячется под перегородкой,
     но без неё тело эмали остаётся открытым. */
  for (const ring of [p.outer, ...p.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (L < EPS) continue;
      const nx = dy / L, ny = -dx / L;
      const quad = [[a, zBottom], [b, zBottom], [b, top], [a, zBottom], [b, top], [a, top]];
      for (const [v, z] of quad) { pos.push(v.x, v.y, z); nor.push(nx, ny, 0); }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
