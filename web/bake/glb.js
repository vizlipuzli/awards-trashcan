/* Выгрузка значка в .glb.
 *
 *   node bake/glb.js toucan
 *
 * Уезжает только геометрия с материалами. Свет и окружение в glTF не
 * кладутся намеренно: их поднимает вьюер тем же lib/look.js, что и
 * редактор, поэтому модель выглядит ровно так, как её настраивали.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const name = process.argv[2] || 'toucan';
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8791';
const out = path.join(__dirname, '..', 'dist');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${ORIGIN}/badge.html?b=${name}&bake=1&size=256`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__bake', { timeout: 120000 });

  const info = await page.evaluate(() => ({ regions: __bake.regions, painted: __bake.painted, before: __bake.stats() }));
  const b64 = await page.evaluate(() => window.__bake.glb());
  if (errs.length) throw new Error(errs.join('\n'));

  const file = path.join(out, `${name}.glb`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  await browser.close();

  const after = await page.evaluate(() => __bake.stats()).catch(() => null);
  console.log(`${file}   ${(fs.statSync(file).size / 1024).toFixed(0)} КБ   областей ${info.regions}, залито ${info.painted}`);
  console.log('вершин до сварки :', JSON.stringify(info.before));
  if (after) console.log('вершин после     :', JSON.stringify(after));
})();
