// Solmar City screenshots: serves repo/game/ locally, loads each ?shot=
// URL in headless Chrome at 1280x800, waits for window.__shotReady, saves
// JPEG (quality stepped down until under the 256 KiB cap).
// Usage: node dev/shot.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import puppeteer from '/home/hatch/workspace/makefun-threejs-fps-02/dev/node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js';

const gameDir = resolve('/home/hatch/workspace/makefun-gta6-01-round2/repo/game');
const shotsDir = resolve('/home/hatch/workspace/makefun-gta6-01-round2/repo/screenshots');
mkdirSync(shotsDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const path = join(gameDir, decodeURIComponent(url.pathname));
  if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
async function shot(name, query) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) errors.push('REQFAIL ' + r.url()); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(base + query, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 700));
  const jpgPath = join(shotsDir, name + '.jpg');
  let quality = 80;
  await page.screenshot({ path: jpgPath, type: 'jpeg', quality });
  let size = statSync(jpgPath).size;
  while (size > 262144 && quality > 40) {
    quality -= 10;
    await page.screenshot({ path: jpgPath, type: 'jpeg', quality });
    size = statSync(jpgPath).size;
  }
  console.log(`${name}: JPEG q${quality} ${size} B${size > 262144 ? ' STILL OVER CAP' : ''}`);
  if (errors.length) console.log(`${name}: ERRORS:`, errors);
  await page.close();
  return errors;
}
const all = [];
all.push(...await shot('1-chase', '?shot=chase&seed=solmar-1'));
all.push(...await shot('2-foot', '?shot=foot&seed=solmar-1'));
all.push(...await shot('3-mission', '?shot=mission&seed=solmar-1'));
all.push(...await shot('4-start', '?shot=start&seed=solmar-1'));
await browser.close();
server.close();
console.log(all.length ? `shots done WITH ${all.length} errors` : 'shots done, no errors');
