/* Мелочь про многоугольники, не требующая Clipper.
   Вынесено отдельно, чтобы отрисовка запечённых контуров могла обойтись
   без библиотеки булевых операций — она нужна только при построении. */
export function area(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/* Внешние кольца против часовой, дырки по часовой. */
export function orient(poly) {
  const fix = (ring, wantCCW) => (area(ring) < 0) === wantCCW ? ring.slice().reverse() : ring;
  return { outer: fix(poly.outer, true), holes: (poly.holes || []).map(h => fix(h, false)) };
}

export const centroid = ring => {
  let x = 0, y = 0;
  for (const p of ring) { x += p.x; y += p.y; }
  return { x: x / ring.length, y: y / ring.length };
};
