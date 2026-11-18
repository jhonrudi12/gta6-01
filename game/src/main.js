// main.js — Solmar City bootstrap, game loop and shared state.
//
// I wrote this as the single wiring file: it builds the renderer and the
// shared world object G, binds keyboard/mouse input, owns the top-level
// state machine (menu / playing / paused / busted / complete), the save
// file, and the player-health flow. The systems themselves live in their
// own modules (city, player, vehicles, peds, police, combat, missions,
// hud, audio, shots) and talk through G.
import * as THREE from 'three';
import { mulberry32 } from './util.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, updateCamera, spawnPickups } from './player.js';
import { spawnTraffic, updateTraffic, drivePlayerCar, tryStealCar, exitCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './peds.js';
import { createPolice, addWanted, updateWanted, spawnPoliceCarAt } from './police.js';
import { createCombat, shoot, updateCombat } from './combat.js';
import { createMissions, updateRivals } from './missions.js';
import { createHud, setObjective, feed, showHitmarker, damageFlash, updateHud, showScreen } from './hud.js';
import { parseShotParams, applyShotPreset } from './shots.js';

const SAVE_KEY = 'solmar-city-save-v1';

export function boot() {
  const params = parseShotParams();
  const G = {
    rng: mulberry32(params.seed),
    seed: params.seed,
    state: 'menu',
    time: 0,
    money: 0,
    keys: new Set(),
    camDist: 9,
    autoOrbit: false,
    gunshotAt: null,
    gunshotTimer: 0,
    bumpCooldown: 0,
    hudDirty: true,
    rivals: [],
    muted: false,
  };

  // Renderer + scene + camera.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.id = 'game-canvas';
  document.getElementById('app').appendChild(renderer.domElement);
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  G.camera.position.set(0, 30, 90);
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Cross-module helpers, bound to G so any system can call them.
  G.audio = createAudio();
  G.setObjective = (t, x) => setObjective(G, t, x);
  G.feed = (m) => feed(G, m);
  G.addWanted = (s, r) => addWanted(G, s, r);
  G.showHitmarker = (h) => showHitmarker(G, h);
  G.damageFlash = () => damageFlash(G);
  G.spawnPoliceCarAt = (x, z) => spawnPoliceCarAt(G, x, z);
  G.shoot = () => shoot(G);
  G.hurtPlayer = (dmg, why) => hurtPlayer(G, dmg, why);

  // Build the world and every system.
  buildCity(G);
  createPlayer(G);
  spawnTraffic(G);
  spawnPeds(G);
  spawnPickups(G);
  createPolice(G);
  createCombat(G);
  createMissions(G);
  createHud(G);

  // Save / load (money + mission progress only — the city re-grows fresh).
  G.saveGame = () => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: G.money,
        missionIndex: G.missions.storyComplete ? 3 : G.missions.index,
        done: G.missions.done,
      }));
    } catch (e) {}
  };
  G.loadSave = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  G.startGame = (fromSave) => {
    G.audio.ensure();
    G.state = 'playing';
    showScreen(G, null);
    if (fromSave) {
      const save = G.loadSave();
      if (save) {
        G.money = save.money || 0;
        G.missions.done = save.done || [false, false, false];
        if (save.missionIndex >= 3) {
          G.missions.storyComplete = true;
          G.missions.index = 3;
          G.missions.stage = 'roam';
          G.setObjective('Solmar City — Free Roam', 'Welcome back! The city is yours. Earn street cash and dodge the patrols.');
        } else {
          G.missions.start(G, save.missionIndex);
        }
        G.feed('Save loaded — welcome back to Solmar City.');
        return;
      }
    }
    G.money = 0;
    G.missions.done = [false, false, false];
    G.missions.storyComplete = false;
    G.missions.start(G, 0);
    G.feed('Marco Solis is back in Solmar City. Lena Cruz has work for you.');
  };

  G.showStoryComplete = () => {
    G.state = 'complete';
    G.hud.completeText.textContent = 'All three jobs done. Marco kept the money, Lena kept the city, and Solmar City stayed sunny. Free roam is open — the streets are yours.';
    showScreen(G, 'complete');
    G.saveGame();
  };

  G.pauseGame = () => {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    showScreen(G, 'pause');
  };
  G.resumeGame = () => {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    showScreen(G, null);
  };

  bindInput(G);
  bindButtons(G);

  // Continue button only appears when a save exists.
  const save = G.loadSave();
  if (save && (save.money > 0 || save.missionIndex > 0)) {
    G.hud.continueBtn.style.display = 'inline-block';
  }

  // Screenshot presets stage the world, then the loop takes over.
  const isShot = applyShotPreset(G, params.shot);
  if (G.state === 'menu') showScreen(G, 'start');
  if (!isShot) {
    showScreen(G, 'start');
    // Menu backdrop: slow orbit over downtown.
    G.player.pos.set(0, 0, 40);
    G.player.camYaw = Math.PI * 0.85;
    G.player.camPitch = 0.42;
    G.autoOrbit = true;
  }

  // The playtest + screenshot handle.
  window.__game = G;
  window.__shotReady = false;

  const clock = new THREE.Clock();
  let frames = 0;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    G.time += dt;
    if (G.bumpCooldown > 0) G.bumpCooldown -= dt;
    // Clouds drift; the sea shimmers by sliding its colour slightly.
    for (const c of G.clouds || []) {
      c.position.x += dt * 1.2;
      if (c.position.x > 300) c.position.x = -300;
    }
    if (G.state === 'playing') {
      if (G.player.onFoot) updatePlayer(G, dt);
      else drivePlayerCar(G, dt);
      updateTraffic(G, dt);
      updatePeds(G, dt);
      updateWanted(G, dt);
      updateCombat(G, dt);
      updateRivals(G, dt);
      G.missions.update(G, dt);
      // Pickups spin.
      for (const pk of G.pickups) {
        if (pk.active) { pk.spin += dt; pk.mesh.rotation.y = pk.spin; pk.mesh.position.y = Math.sin(G.time * 2 + pk.spin) * 0.15; }
      }
      // Siren + engine follow the action.
      G.audio.siren(G.wanted > 0, dt);
      if (G.player.onFoot) G.audio.engine(0, false);
    } else if (G.state === 'menu' && G.autoOrbit) {
      G.player.camYaw += dt * 0.04;
      updateTraffic(G, dt);
      updatePeds(G, dt);
    }
    updateCamera(G, dt);
    updateHud(G);
    renderer.render(G.scene, G.camera);
    frames++;
    if (frames === 12) window.__shotReady = true;
  }
  loop();
  return G;
}

function hurtPlayer(G, dmg, why) {
  if (G.state !== 'playing') return;
  G.player.hp -= dmg;
  G.damageFlash();
  G.hudDirty = true;
  if (G.player.hp <= 0) {
    G.player.hp = 0;
    const fine = Math.min(G.money, 200);
    G.money -= fine;
    G.wanted = 0;
    for (const pc of G.policeCars) G.scene.remove(pc.mesh);
    G.policeCars = [];
    for (const pf of G.policeFoot) G.scene.remove(pf.mesh);
    G.policeFoot = [];
    if (G.player.car) { exitCar(G); }
    G.player.pos.copy(G.landmarks.hospital);
    G.player.hp = G.player.maxHp;
    G.state = 'busted';
    G.audio.busted();
    G.hud.bustedText.textContent = 'The Solmar City patrols caught you' + (why ? ' — ' + why : '') +
      '. Fine: $' + fine + '. You wake up at St. Marina Hospital, wanted level cleared.';
    showScreen(G, 'busted');
    G.saveGame();
    G.feed('BUSTED! Fine $' + fine + '. Woke up at the hospital.');
  }
}

function bindInput(G) {
  const canvas = G.renderer.domElement;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    G.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE' && G.state === 'playing') tryStealCar(G);
    if (e.code === 'KeyF' && G.state === 'playing') exitCar(G);
    if (e.code === 'Digit1' && G.state === 'playing') { G.player.weapon = 'fist'; G.feed('Fists ready.'); }
    if (e.code === 'Digit2' && G.state === 'playing') { G.player.weapon = 'pistol'; G.feed('Pistol ready — click to fire.'); }
    if (e.code === 'KeyM') {
      G.muted = !G.muted;
      G.audio.setMuted(G.muted);
      G.feed(G.muted ? 'Sound muted.' : 'Sound on.');
    }
    if ((e.code === 'Escape' || e.code === 'KeyP')) {
      if (G.state === 'playing') G.pauseGame();
      else if (G.state === 'paused') G.resumeGame();
    }
  });
  window.addEventListener('keyup', (e) => G.keys.delete(e.code));
  window.addEventListener('blur', () => G.keys.clear());

  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
    G.audio.ensure();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    G.player.camYaw -= dx * 0.005;
    G.player.camPitch = Math.max(-0.15, Math.min(1.1, G.player.camPitch + dy * 0.004));
  });
  window.addEventListener('mouseup', (e) => {
    if (dragging && moved < 6 && G.state === 'playing' && G.player.weapon === 'pistol' && G.player.onFoot) {
      shoot(G);
    }
    dragging = false;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    G.camDist = Math.max(5, Math.min(15, G.camDist + Math.sign(e.deltaY)));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindButtons(G) {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('btn-start', () => { G.autoOrbit = false; G.startGame(false); });
  on('btn-continue', () => { G.autoOrbit = false; G.startGame(true); });
  on('btn-resume', () => G.resumeGame());
  on('btn-restart', () => window.location.reload());
  on('btn-busted-ok', () => { showScreen(G, null); G.state = 'playing'; });
  on('btn-complete-roam', () => { showScreen(G, null); G.state = 'playing'; });
}

boot();
