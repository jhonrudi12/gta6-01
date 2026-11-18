// hud.js — every DOM overlay: the HUD (money, objective, wanted stars,
// health bar, speed, crosshair, hitmarker, message feed, damage vignette),
// the 2D top-down minimap, and the start / pause / busted / story screens.
import { moneyStr, clamp } from './util.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  G.hud = {
    money: $('hud-money'), objective: $('hud-objective'), objText: $('hud-objtext'),
    timer: $('hud-timer'), stars: $('hud-stars'), hpFill: $('hud-hpfill'),
    hpText: $('hud-hptext'), speed: $('hud-speed'), feed: $('hud-feed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), vignette: $('vignette'),
    minimap: $('minimap'), start: $('screen-start'), pause: $('screen-pause'),
    busted: $('screen-busted'), complete: $('screen-complete'),
    startTitle: $('start-title'), continueBtn: $('btn-continue'),
    bustedText: $('busted-text'), completeText: $('complete-text'),
    hint: $('hud-hint'),
  };
  G.hudCtx = G.hud.minimap.getContext('2d');
  G.feedItems = [];
}

export function setObjective(G, title, text) {
  G.hud.objective.textContent = title;
  G.hud.objText.textContent = text;
}

export function feed(G, msg) {
  G.feedItems.push(msg);
  if (G.feedItems.length > 4) G.feedItems.shift();
  G.hud.feed.innerHTML = G.feedItems.map((m) => '<div>' + escapeHtml(m) + '</div>').join('');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function showHitmarker(G, hit) {
  const h = G.hud.hitmarker;
  h.style.display = 'block';
  h.style.borderColor = hit ? '#ff4444' : '#ffffff';
  clearTimeout(G._hmTimer);
  G._hmTimer = setTimeout(() => { h.style.display = 'none'; }, 120);
}

export function damageFlash(G) {
  const v = G.hud.vignette;
  v.style.opacity = '0.85';
  setTimeout(() => { v.style.opacity = '0'; }, 180);
}

export function updateHud(G) {
  const h = G.hud;
  const p = G.player;
  h.money.textContent = moneyStr(G.money);
  const stars = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
  h.stars.textContent = stars;
  h.stars.style.color = G.wanted > 0 ? '#ffd23c' : '#888888';
  const hpPct = clamp(p.hp / p.maxHp * 100, 0, 100);
  h.hpFill.style.width = hpPct + '%';
  h.hpFill.style.background = hpPct > 50 ? '#3aa84f' : hpPct > 25 ? '#e8b820' : '#d23c2e';
  h.hpText.textContent = 'HP ' + Math.ceil(p.hp);
  const speedKmh = p.car ? Math.abs(p.car.speed) * 3.6 : (p.moving ? (G.keys.has('ShiftLeft') ? 34 : 19) : 0);
  h.speed.textContent = p.car ? Math.round(speedKmh) + ' km/h' : (p.onFoot ? 'ON FOOT' : '');
  h.crosshair.style.display = (p.weapon === 'pistol' && p.onFoot && G.state === 'playing') ? 'block' : 'none';
  // Mission timer (M2).
  if (G.missions.index === 1 && G.missions.stage === 'deliver' && G.state === 'playing') {
    h.timer.style.display = 'block';
    h.timer.textContent = '⏱ ' + Math.max(0, Math.ceil(G.missions.timer)) + 's';
    h.timer.style.color = G.missions.timer < 15 ? '#ff5555' : '#ffffff';
  } else {
    h.timer.style.display = 'none';
  }
  // Context hint: steal prompt when near a traffic car.
  if (G.state === 'playing' && p.onFoot && !p.car) {
    let near = false;
    for (const car of G.cars) {
      if (car.kind !== 'traffic') continue;
      const dx = car.mesh.position.x - p.pos.x, dz = car.mesh.position.z - p.pos.z;
      if (dx * dx + dz * dz < 18) { near = true; break; }
    }
    h.hint.style.display = near ? 'block' : 'none';
    if (near) h.hint.textContent = 'Press E to steal this car';
  } else if (G.state === 'playing' && p.car) {
    h.hint.style.display = 'block';
    h.hint.textContent = 'F to leave the car · E near another car to swap';
  } else {
    h.hint.style.display = 'none';
  }
  drawMinimap(G);
}

function drawMinimap(G) {
  const ctx = G.hudCtx;
  const S = 200, W = 380; // world -190..190 maps to 0..200
  const toMap = (x, z) => [(x + W / 2) / W * S, (z + W / 2) / W * S];
  ctx.clearRect(0, 0, S, S);
  // Land + sea.
  ctx.fillStyle = '#3a3f45'; ctx.fillRect(0, 0, S, S);
  const [, seaY] = toMap(0, 178);
  ctx.fillStyle = '#2e7fb8'; ctx.fillRect(0, seaY, S, S - seaY);
  ctx.fillStyle = '#e8d29a'; ctx.fillRect(0, toMap(0, 150)[1], S, seaY - toMap(0, 150)[1]);
  // Roads.
  ctx.strokeStyle = '#222222'; ctx.lineWidth = 4;
  for (const s of [-120, -80, -40, 0, 40, 80, 120]) {
    const [x] = toMap(s, 0); const [, y] = toMap(0, s);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  // Buildings as dark dots (only a coarse scatter: the skyline is dense).
  ctx.fillStyle = '#565d66';
  for (const b of G.city.buildings) {
    const [x, y] = toMap(b.x, b.z);
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  // Traffic cars (yellow), police cars (red), foot police (blue).
  ctx.fillStyle = '#ffe14d';
  for (const car of G.cars) {
    if (car.kind === 'player') continue;
    const [x, y] = toMap(car.mesh.position.x, car.mesh.position.z);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  for (const pc of G.policeCars) {
    const [x, y] = toMap(pc.mesh.position.x, pc.mesh.position.z);
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#4488ff';
  for (const pf of G.policeFoot) {
    if (!pf.alive) continue;
    const [x, y] = toMap(pf.pos.x, pf.pos.z);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  // Mission target (green star).
  if (G.missions.target && G.state === 'playing') {
    const [x, y] = toMap(G.missions.target.x, G.missions.target.z);
    ctx.fillStyle = '#3aff7a';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      const px = x + Math.cos(a) * 6, py = y + Math.sin(a) * 6;
      const a2 = a + Math.PI / 5;
      const qx = x + Math.cos(a2) * 2.5, qy = y + Math.sin(a2) * 2.5;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      ctx.lineTo(qx, qy);
    }
    ctx.closePath(); ctx.fill();
  }
  // Player arrow (white triangle, rotated to heading).
  const [px, py] = toMap(G.player.pos.x, G.player.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(Math.sin(G.player.yaw), Math.cos(G.player.yaw)) + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // North + border.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
}

// --- Screens ---------------------------------------------------------------
export function showScreen(G, which) {
  for (const k of ['start', 'pause', 'busted', 'complete']) {
    G.hud[k].style.display = k === which ? 'flex' : 'none';
  }
  // The HUD stays hidden behind the title screen.
  document.body.classList.toggle('in-menu', which === 'start');
  G.hudVisible = which;
}
