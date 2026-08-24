/* Выгрузка контуров вместо сетки. Меряем оба варианта. */
const puppeteer = require('puppeteer');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const name = process.argv[2] || 'toucan';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8791';
const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });

const kb = n => (n / 1024).toFixed(0).padStart(5) + ' КБ';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'] });
  const page = await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${ORIGIN}/badge.html?b=${name}&bake=1&size=256`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__bake', { timeout: 120000 });

  const json = await page.evaluate(() => window.__bake.contours());
  const file = path.join(out, `${name}-contours.json`);
  fs.writeFileSync(file, json);
  const gz = zlib.gzipSync(Buffer.from(json), { level: 9 }).length;
  console.log(`${path.basename(file)}   ${kb(json.length)}   в gzip ${kb(gz)}`);

  if (errs.length) throw new Error(errs.join('\n'));

  const glb = path.join(out, `${name}.glb`);
  if (fs.existsSync(glb)) console.log(`\nдля сравнения: ${name}.glb ${kb(fs.statSync(glb).size)}` +
    `   в gzip ${kb(zlib.gzipSync(fs.readFileSync(glb), { level: 9 }).length)}`);
  await browser.close();
})();
