/* Запекание значка в анимированный WebP с прозрачным фоном.
 *
 *   node bake/bake.js toucan [размер] [кадров]
 *
 * Кадры снимаются из badge.html?bake=1 — то есть тем же рендером, что и
 * живая страница, а не отдельной реализацией. Вращение только вокруг оси:
 * покачивание имеет другой период и разошлось бы на стыке петли.
 */
const puppeteer = require('puppeteer');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const name   = process.argv[2] || 'toucan';
const size   = +(process.argv[3] || 512);
const frames = +(process.argv[4] || 48);
const motion = process.argv[5] || 'swing';          // swing | spin
const qual   = +(process.argv[6] || 80);
const swing  = 38;                                  // градусов в каждую сторону
const delay  = 40;                                  // мс на кадр

/* Полный оборот половину петли показывает заднюю сторону — плоскую
   металлическую пластину. Для значка на чужой странице это мёртвое время,
   поэтому по умолчанию не оборот, а покачивание: синус замыкается сам,
   стык петли получается бесшовным. */
const angleAt = i => motion === 'spin'
  ? (i / frames) * 360
  : swing * Math.sin((i / frames) * 2 * Math.PI);
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8791';

const out = path.join(__dirname, '..', 'dist');
const tmp = fs.mkdtempSync('/tmp/bake-');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });

  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${ORIGIN}/badge.html?b=${name}&bake=1&size=${size}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__bake', { timeout: 120000 });
  await new Promise(r => setTimeout(r, 1500));
  if (errs.length) throw new Error(errs.join('\n'));

  const files = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate(a => window.__bake.setAngle(a), angleAt(i));
    await new Promise(r => setTimeout(r, 60));       // два кадра rAF
    const f = path.join(tmp, `f${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: f, omitBackground: true });
    files.push(f);
    process.stdout.write(`\rкадр ${i + 1}/${frames}`);
  }
  process.stdout.write('\n');

  const poster = path.join(out, `${name}-poster.png`);
  fs.copyFileSync(files[Math.round(frames * 0.12)], poster);

  const webp = path.join(out, `${name}-${size}.webp`);
  execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', String(qual), '-m', '6',
    '-d', String(delay), ...files, '-o', webp], { stdio: 'inherit' });

  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  const kb = f => (fs.statSync(f).size / 1024).toFixed(0) + ' КБ';
  console.log(`\n${webp}   ${kb(webp)}   ${size}px · ${frames} кадров · ${(frames * delay / 1000).toFixed(2)} с петля · ${motion}`);
  console.log(`${poster}   ${kb(poster)}`);
})();
