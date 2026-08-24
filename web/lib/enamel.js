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
 *
 * Кольца мениска сюда приходят готовыми (plan). Считает их Clipper при
 * запекании, а здесь его нет намеренно: тогда показ запечённых контуров
 * обходится без библиотеки булевых операций.
 */
import * as THREE from 'three';
import { orient } from './poly.js';

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
export function enamelGeometry(poly, { zBottom, zFloor, zEdge }, plan) {
  const p = orient(poly);
  const { w, bands, scale = 1, dome = false } = plan;

  /* Недолитая эмаль смачивает стенку и лезет по ней вверх: край выше
     середины, поверхность вогнутая. Перелитая упирается в кромку и
     вспухает куполом: середина выше края. Это одно явление по разные
     стороны от кромки, поэтому знак мениска переключается сам.

     У вогнутой чаши ячейка у́же двух ширин мениска стала бы куполом, и
     подъём гасится по тому, насколько её удалось вдвинуть внутрь — это
     держит мелочь вроде пальцев плоской. */
  const edge = dome ? zEdge : zFloor + (zEdge - zFloor) * scale;
  const mid  = dome ? zFloor : zFloor;              // zFloor здесь — уровень середины
  const top  = dome ? Math.max(edge, mid) : (w > 0 ? edge : zFloor);

  // u = 0 у стенки, 1 на средней линии ячейки
  const U = d => (w > 0 ? Math.min(1, d / w) : 1);
  const H  = dome
    ? d => { const u = U(d); return edge + (mid - edge) * u * (2 - u); }
    : d => { const u = U(d); return zFloor + (edge - zFloor) * (1 - u) ** 2; };
  const dH = dome
    ? d => { const u = U(d); return u >= 1 ? 0 : 2 * (mid - edge) * (1 - u) / w; }
    : d => { const u = U(d); return u >= 1 ? 0 : -2 * (edge - zFloor) * (1 - u) / w; };

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

  /* крышка: кольцо за кольцом от края внутрь, последнее — плоское дно чаши */
  for (const band of bands)
    for (const q of band) { const { tris, all } = faces(q); for (const t of tris) for (const k of t) putTop(all[k]); }

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
      const wall = dome ? edge : top;
      const quad = [[a, zBottom], [b, zBottom], [b, wall], [a, zBottom], [b, wall], [a, wall]];
      for (const [v, z] of quad) { pos.push(v.x, v.y, z); nor.push(nx, ny, 0); }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}
