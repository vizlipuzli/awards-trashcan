/* Растровая раскраска -> векторные области.
 *
 * На вход приходит картинка-раскраска: чёрные линии по белому. Замкнутых
 * контуров в ней нет, есть только штрихи, поэтому области ищутся заливкой:
 *   - всё чёрное  -> линия (станет металлическим ограждением);
 *   - белое, дотянувшееся до рамки -> фон (за пределами значка);
 *   - остальное белое -> ячейки под эмаль, каждая своя.
 * Силуэт значка = всё, что не фон, то есть линии вместе с ячейками.
 */

/* Чёрное/белое по яркости. Прозрачное считаем белым. */
export function binarize(imageData, threshold = 128) {
  const { width: W, height: H, data } = imageData;
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < ink.length; i++, p += 4) {
    const lum = data[p + 3] < 128 ? 255
      : data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    ink[i] = lum < threshold ? 1 : 0;
  }
  return ink;
}

/* Разметка: -1 линия, 1 фон, >=2 ячейки. */
export function label(ink, W, H, minArea = 64) {
  const lab = new Int32Array(W * H);
  for (let i = 0; i < ink.length; i++) if (ink[i]) lab[i] = -1;

  const stack = [];
  const flood = (start, id) => {
    let area = 0;
    lab[start] = id; stack.push(start);
    while (stack.length) {
      const i = stack.pop(); area++;
      const x = i % W, y = (i / W) | 0;
      if (x > 0     && lab[i - 1] === 0) { lab[i - 1] = id; stack.push(i - 1); }
      if (x < W - 1 && lab[i + 1] === 0) { lab[i + 1] = id; stack.push(i + 1); }
      if (y > 0     && lab[i - W] === 0) { lab[i - W] = id; stack.push(i - W); }
      if (y < H - 1 && lab[i + W] === 0) { lab[i + W] = id; stack.push(i + W); }
    }
    return area;
  };

  // фон — со всех белых пикселей рамки
  for (let x = 0; x < W; x++) {
    if (lab[x] === 0) flood(x, 1);
    if (lab[(H - 1) * W + x] === 0) flood((H - 1) * W + x, 1);
  }
  for (let y = 0; y < H; y++) {
    if (lab[y * W] === 0) flood(y * W, 1);
    if (lab[y * W + W - 1] === 0) flood(y * W + W - 1, 1);
  }

  const all = [];
  let id = 2;
  for (let i = 0; i < lab.length; i++) {
    if (lab[i] !== 0) continue;
    all.push({ id, area: flood(i, id) });
    id++;
  }
  const kept = all.filter(c => c.area >= minArea);
  return { lab, cells: kept, dropped: all.length - kept.length };
}

/* Обход границы бинарной маски по рёбрам пикселей.
   Возвращает замкнутые кольца в координатах углов пикселей. */
export function trace(test, W, H) {
  const KEY = (x, y) => x * 65536 + y;
  const out = new Map();                       // точка -> список выходящих рёбер
  const add = (x0, y0, x1, y1) => {
    let l = out.get(KEY(x0, y0));
    if (!l) out.set(KEY(x0, y0), l = []);
    l.push([x1, y1]);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!test(i)) continue;
      // внутренность остаётся справа по ходу движения
      if (y === 0     || !test(i - W)) add(x, y, x + 1, y);
      if (x === W - 1 || !test(i + 1)) add(x + 1, y, x + 1, y + 1);
      if (y === H - 1 || !test(i + W)) add(x + 1, y + 1, x, y + 1);
      if (x === 0     || !test(i - 1)) add(x, y + 1, x, y);
    }
  }

  const rings = [];
  while (out.size) {
    const first = out.keys().next().value;
    let cx = Math.floor(first / 65536), cy = first % 65536;
    const sx = cx, sy = cy;
    const ring = [];
    let dx = 0, dy = 0;
    for (;;) {
      const list = out.get(KEY(cx, cy));
      if (!list || !list.length) break;
      // на неоднозначном углу выбираем самый правый поворот — так
      // диагональные касания линий не сливаются в восьмёрку
      let pick = 0;
      if (list.length > 1 && (dx || dy)) {
        const score = ([nx, ny]) => {
          const ex = nx - cx, ey = ny - cy;
          const cross = dx * ey - dy * ex, dot = dx * ex + dy * ey;
          return cross < 0 ? 0 : dot > 0 ? 1 : cross > 0 ? 2 : 3;
        };
        let best = 9;
        list.forEach((e, k) => { const s = score(e); if (s < best) { best = s; pick = k; } });
      }
      const [nx, ny] = list.splice(pick, 1)[0];
      if (!list.length) out.delete(KEY(cx, cy));
      ring.push([cx, cy]);
      dx = nx - cx; dy = ny - cy;
      cx = nx; cy = ny;
      if (cx === sx && cy === sy) break;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

const area2 = r => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

/* Рамер–Дуглас–Пекер */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const vx = bx - ax, vy = by - ay, L = Math.hypot(vx, vy) || 1;
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * vy - (pts[i][1] - ay) * vx) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/* Чайкин — снимает пиксельную лесенку */
function smooth(pts, iterations) {
  for (let k = 0; k < iterations; k++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}

/* Кольца одной маски -> {outer, holes} по знаку площади. */
function toShape(rings, tol, smoothing) {
  const done = rings
    .map(r => smooth(simplify(r, tol), smoothing))
    .filter(r => r.length >= 3)
    .map(r => ({ pts: r, a: area2(r) }));
  if (!done.length) return null;
  done.sort((x, y) => Math.abs(y.a) - Math.abs(x.a));
  const sign = Math.sign(done[0].a);
  return {
    outer: done[0].pts,
    holes: done.slice(1).filter(r => Math.sign(r.a) !== sign).map(r => r.pts)
  };
}

/* Дистанционное преобразование: для каждого пикселя маски — расстояние
   до ближайшего пикселя вне её. Два прохода, веса 1 и sqrt(2). */
function distanceMap(inside, W, H) {
  const INF = 1e9, d = new Float32Array(W * H);
  const A = 1, B = Math.SQRT2;
  for (let i = 0; i < d.length; i++) d[i] = inside(i) ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x > 0)               v = Math.min(v, d[i - 1] + A);
    if (y > 0)               v = Math.min(v, d[i - W] + A);
    if (x > 0 && y > 0)      v = Math.min(v, d[i - W - 1] + B);
    if (x < W - 1 && y > 0)  v = Math.min(v, d[i - W + 1] + B);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1)                 v = Math.min(v, d[i + 1] + A);
    if (y < H - 1)                 v = Math.min(v, d[i + W] + A);
    if (x < W - 1 && y < H - 1)    v = Math.min(v, d[i + W + 1] + B);
    if (x > 0 && y < H - 1)        v = Math.min(v, d[i + W - 1] + B);
    d[i] = v;
  }
  return d;
}

/* Два числа, которые нельзя выбирать на вкус — они свойства рисунка.
   ink  — толщина штриха как 2*площадь/периметр. Для полосы ширины w это
          даёт ровно w, а сплошные пятна (залитый зрачок) занижают оценку,
          а не завышают — что здесь и нужно. Среднее по карте расстояний
          пробовалось и врёт вдвое именно из-за таких пятен.
   band — предел для канта: кант шириной больше этого целиком проглотит
          какую-нибудь значимую область. Считается как минимум по областям
          от их максимального удаления от края силуэта. */
function measure(lab, cells, W, H) {
  let inkArea = 0, inkEdges = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (lab[i] !== -1) continue;
    inkArea++;
    if (x === 0     || lab[i - 1] !== -1) inkEdges++;
    if (x === W - 1 || lab[i + 1] !== -1) inkEdges++;
    if (y === 0     || lab[i - W] !== -1) inkEdges++;
    if (y === H - 1 || lab[i + W] !== -1) inkEdges++;
  }
  const ink = inkEdges ? 2 * inkArea / inkEdges : 2;

  const dSil = distanceMap(i => lab[i] !== 1, W, H);
  let silArea = 0;
  for (let i = 0; i < lab.length; i++) if (lab[i] !== 1) silArea++;
  const peak = new Map();
  for (let i = 0; i < lab.length; i++) {
    const id = lab[i];
    if (id > 1 && dSil[i] > (peak.get(id) ?? 0)) peak.set(id, dSil[i]);
  }
  let band = Infinity;
  for (const c of cells) {
    if (c.area < silArea * 0.005) continue;        // мелочь вроде пальцев не в счёт
    band = Math.min(band, peak.get(c.id) ?? Infinity);
  }
  return { ink, band: Number.isFinite(band) ? band : ink * 4 };
}

/* Полный разбор картинки. */
export function extract(imageData, opts = {}) {
  const { threshold = 128, minArea = 64, tolerance = 1.2, smoothing = 2 } = opts;
  const W = imageData.width, H = imageData.height;
  const ink = binarize(imageData, threshold);
  const { lab, cells, dropped } = label(ink, W, H, minArea);

  const silhouette = toShape(trace(i => lab[i] !== 1, W, H), tolerance, smoothing);
  const regions = cells.map(c => {
    const s = toShape(trace(i => lab[i] === c.id, W, H), tolerance, smoothing);
    return s && { ...s, area: c.area };
  }).filter(Boolean);

  regions.sort((a, b) => b.area - a.area);
  return { width: W, height: H, silhouette, regions, dropped, suggest: measure(lab, cells, W, H) };
}
