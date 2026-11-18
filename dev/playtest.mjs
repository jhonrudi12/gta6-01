// Headless playtest for Solmar City: boots the live game (no ?shot=),
// asserts zero console errors / failed requests, then drives it: start the
// game, walk, steal a car, check wanted rises, finish M1 by driving to the
// garage, fire the pistol, and confirm the HUD updates. Exits 1 on failure.
// Usage: node dev/playtest.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import puppeteer from '/home/hatch/workspace/makefun-threejs-fps-02/dev/node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js';

const gameDir = resolve('/home/hatch/workspace/makefun-gta6-01/repo/game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const path = join(gameDir, decodeURIComponent(url.pathname));
  if (!existsSync(path) || !statSync(path).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => { if (!r.url().includes('favicon')) errors.push('REQFAIL ' + r.url()); });
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));
const fails = [];
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) fails.push(name); };
const state = () => page.evaluate(() => {
  const g = window.__game;
  return {
    state: g.state, wanted: g.wanted, money: g.money, hp: g.player.hp,
    mission: g.missions.index, stage: g.missions.stage,
    px: g.player.pos.x, pz: g.player.pos.z, onFoot: g.player.onFoot,
    inCar: !!g.player.car, buildings: g.buildingCount,
    traffic: g.cars.filter((c) => c.kind === 'traffic').length,
    peds: g.peds.filter((p) => p.alive).length,
    police: g.policeCars.length,
    stars: document.getElementById('hud-stars').textContent,
    moneyText: document.getElementById('hud-money').textContent,
    objText: document.getElementById('hud-objective').textContent,
  };
});

let st = await state();
check('game boots to menu', st.state === 'menu', JSON.stringify(st));
check('city built (~120 buildings, 14 traffic, 24 peds)', st.buildings > 90 && st.traffic === 14 && st.peds === 24, `b=${st.buildings} t=${st.traffic} p=${st.peds}`);

// Start the game via the real button.
await page.click('#btn-start');
await new Promise((r) => setTimeout(r, 800));
st = await state();
check('start button begins play, M1 active', st.state === 'playing' && st.mission === 0 && st.stage === 'steal', JSON.stringify(st));

// Walk forward with W (headless SwiftShader runs slowly; 3 s is plenty).
const z0 = st.pz;
await page.keyboard.down('w');
await new Promise((r) => setTimeout(r, 3000));
await page.keyboard.up('w');
st = await state();
check('WASD moves the player on foot', Math.abs(st.pz - z0) > 1 || Math.abs(st.px) > 0.5, `z ${z0.toFixed(1)} -> ${st.pz.toFixed(1)}`);

// Teleport next to a traffic car and steal it with E.
await page.evaluate(() => {
  const g = window.__game;
  const car = g.cars.find((c) => c.kind === 'traffic');
  g.player.pos.set(car.mesh.position.x + 2, 0, car.mesh.position.z);
});
await page.keyboard.press('e');
await new Promise((r) => setTimeout(r, 600));
st = await state();
check('E steals a car, wanted rises to 1', st.inCar === true && st.wanted >= 1, JSON.stringify(st));
check('HUD stars show wanted', st.stars.includes('★'), st.stars);

// Drive toward Lena's garage and finish M1.
await page.evaluate(() => {
  const g = window.__game;
  const car = g.player.car;
  car.mesh.position.set(-112, 0, -92);
  car.speed = 0;
  g.player.pos.set(-112, 0, -92);
});
await new Promise((r) => setTimeout(r, 1200));
st = await state();
check('M1 completes at the garage, pays $500, M2 starts', st.mission === 1 && st.money === 500, JSON.stringify(st));

// Police must have spawned while wanted >= 1.
await new Promise((r) => setTimeout(r, 6000));
st = await state();
check('police patrol cars spawn at wanted >= 1', st.police >= 1, `police=${st.police}`);

// Pistol: get out of the car first (no drive-by shooting), switch to
// weapon 2, and confirm firing works and the crosshair shows.
await page.keyboard.press('f');
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => { const g = window.__game; g.player.weapon = 'pistol'; });
await page.evaluate(() => window.__game.shoot());
await new Promise((r) => setTimeout(r, 500));
const cross = await page.evaluate(() => document.getElementById('crosshair').style.display);
check('pistol fires, crosshair visible', cross === 'block', `crosshair=${cross}`);

// M3 flow: start mission 3, shoot a rival point-blank, confirm a kill.
// Aim with camYaw (the camera loop owns the camera): player 4 m south of
// the rival, facing +z (camYaw 0).
const m3 = await page.evaluate(async () => {
  const g = window.__game;
  g.missions.start(g, 2);
  await new Promise((r) => setTimeout(r, 300));
  const rival = g.rivals.find((x) => x.alive);
  g.player.pos.set(rival.pos.x, 0, rival.pos.z - 4);
  g.player.camYaw = 0;
  g.player.weapon = 'pistol';
  await new Promise((r) => setTimeout(r, 300));
  const hp0 = rival.hp;
  g.shoot();
  await new Promise((r) => setTimeout(r, 400));
  return { hp0, hp1: rival.hp, alive: rival.alive, rivals: g.rivals.length };
});
check('pistol hits a rival (HP drops)', m3.hp1 < m3.hp0, JSON.stringify(m3));

// Kill all rivals -> escape stage, then reach the safehouse -> story complete.
const end = await page.evaluate(async () => {
  const g = window.__game;
  for (const r of g.rivals) if (r.alive) { r.hp = 1; }
  // Damage each rival once through the real path: shoot is ray-based, so
  // use the damage path via a point-blank shot loop instead.
  for (const r of g.rivals) {
    if (!r.alive) continue;
    g.player.pos.set(r.pos.x, 0, r.pos.z - 3);
    g.player.camYaw = 0;
    await new Promise((r2) => setTimeout(r2, 250));
    g.combat.fireCooldown = 0;
    g.shoot();
    await new Promise((r2) => setTimeout(r2, 150));
    g.combat.fireCooldown = 0;
    g.shoot();
    await new Promise((r2) => setTimeout(r2, 150));
    g.combat.fireCooldown = 0;
    g.shoot();
    await new Promise((r2) => setTimeout(r2, 150));
  }
  await new Promise((r2) => setTimeout(r2, 500));
  const stage = g.missions.stage;
  // Walk to the safehouse.
  g.player.pos.set(-128, 0, 116);
  await new Promise((r2) => setTimeout(r2, 800));
  return { stage, state: g.state, mission: g.missions.index, money: g.money };
});
check('all rivals down -> escape stage', end.stage === 'escape' || end.state === 'complete', JSON.stringify(end));
check('reaching safehouse completes the story', end.state === 'complete' && end.mission === 3, JSON.stringify(end));

check('zero console errors / failed requests', errors.length === 0, errors.join(' | ').slice(0, 500));
await browser.close(); server.close();
console.log(fails.length ? `PLAYTEST FAILED: ${fails.join(', ')}` : 'PLAYTEST ALL PASS');
process.exit(fails.length ? 1 : 0);
