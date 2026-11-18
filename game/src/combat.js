// combat.js — fist and pistol combat. The pistol is a hitscan shot from
// the camera through the crosshair, with a muzzle flash, a tracer line and
// a red hitmarker; rivals and foot officers have health bars, and every
// shot makes nearby pedestrians scatter.
import * as THREE from 'three';
import { clamp, dist2D } from './util.js';

export function createCombat(G) {
  G.combat = { fireCooldown: 0, meleeCooldown: 0, tracers: [] };
  // Reused tracer pool: one line per shot, faded out in the main loop.
  const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, mat.clone());
    line.visible = false;
    G.scene.add(line);
    G.combat.tracers.push({ line, life: 0 });
  }
  // Muzzle flash: a small bright sprite at the gun.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 })
  );
  flash.name = 'muzzleFlash';
  G.scene.add(flash);
  G.combat.flash = flash;
  G.combat.flashLife = 0;
  // Raycaster for hitscan.
  G.combat.ray = new THREE.Raycaster();
}

function fireTracer(G, from, to) {
  const t = G.combat.tracers.find((x) => x.life <= 0) || G.combat.tracers[0];
  t.line.geometry.setFromPoints([from, to]);
  t.line.visible = true;
  t.life = 0.09;
}

export function shoot(G) {
  const c = G.combat;
  if (c.fireCooldown > 0 || G.state !== 'playing') return false;
  const p = G.player;
  if (!p.onFoot) return false; // no drive-by shooting: get out first
  if (p.weapon !== 'pistol') { melee(G); return false; }
  c.fireCooldown = 0.28;
  G.audio.ensure();
  G.audio.shot();
  // The shot leaves the gun, not the camera: the camera sits metres above
  // the player, so a ray from the camera would fly over anything close.
  // Aim at the point the camera is looking at, 50 m out, from chest height.
  const from = p.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
  const camDir = new THREE.Vector3();
  G.camera.getWorldDirection(camDir);
  const aimPoint = G.camera.position.clone().add(camDir.clone().multiplyScalar(50));
  const dir = aimPoint.clone().sub(from).normalize();
  const to = from.clone().add(dir.clone().multiplyScalar(60));
  c.ray.set(from, dir);
  c.ray.far = 60;
  // Find the nearest hittable target along the ray.
  let best = null, bestD = 60;
  const targets = [];
  for (const r of G.rivals) if (r.alive) targets.push({ obj: r, pos: r.pos, radius: 1.1, hp: 'rival' });
  for (const pf of G.policeFoot) if (pf.alive) targets.push({ obj: pf, pos: pf.pos, radius: 1.0, hp: 'police' });
  for (const ped of G.peds) if (ped.alive && ped.fleeing !== 'dead') targets.push({ obj: ped, pos: ped.pos, radius: 0.9, hp: 'ped' });
  for (const t of targets) {
    // Sphere test against the ray.
    const toT = new THREE.Vector3().subVectors(t.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), from);
    const along = toT.dot(dir);
    if (along < 0.5 || along > bestD) continue;
    const closest = from.clone().add(dir.clone().multiplyScalar(along));
    const miss = closest.distanceTo(t.pos.clone().add(new THREE.Vector3(0, 1.2, 0)));
    if (miss < t.radius + 0.55) { best = t; bestD = along; }
  }
  let end = to;
  if (best) {
    end = from.clone().add(dir.clone().multiplyScalar(bestD));
    const dmg = 34;
    if (best.hp === 'rival') damageRival(G, best.obj, dmg);
    else if (best.hp === 'police') damageOfficer(G, best.obj, dmg);
    else {
      // Shooting a pedestrian is a crime; they fall and the heat rises.
      best.obj.alive = false;
      best.obj.fleeing = 'dead';
      best.obj.mesh.visible = false;
      best.obj.respawnIn = 14;
      G.addWanted(1, 'shot a pedestrian');
      G.feed('You shot a pedestrian!');
    }
    G.showHitmarker(true);
  } else {
    G.showHitmarker(false);
  }
  fireTracer(G, from, end);
  c.flash.position.copy(from).add(dir.clone().multiplyScalar(1.2));
  c.flash.material.opacity = 1;
  c.flashLife = 0.06;
  G.gunshotAt = p.pos.clone();
  G.gunshotTimer = 2;
  return true;
}

function melee(G) {
  const c = G.combat;
  if (c.meleeCooldown > 0) return;
  c.meleeCooldown = 0.45;
  const p = G.player;
  let hitAny = false;
  for (const r of G.rivals) {
    if (r.alive && dist2D(p.pos.x, p.pos.z, r.pos.x, r.pos.z) < 2.4) { damageRival(G, r, 25); hitAny = true; }
  }
  for (const pf of G.policeFoot) {
    if (pf.alive && dist2D(p.pos.x, p.pos.z, pf.pos.x, pf.pos.z) < 2.4) { damageOfficer(G, pf, 25); hitAny = true; }
  }
  if (hitAny) G.showHitmarker(true);
}

function damageRival(G, r, dmg) {
  r.hp -= dmg;
  r.flash = 0.12;
  if (r.hp <= 0) {
    r.alive = false;
    r.mesh.visible = false;
    if (r.hpBar) r.hpBar.visible = false;
    G.addWanted(1, 'took down a rival');
    G.feed('Rival down! ' + G.rivals.filter((x) => x.alive).length + ' left.');
    G.missions.onRivalDown(G);
  }
}

function damageOfficer(G, pf, dmg) {
  pf.hp -= dmg;
  if (pf.hp <= 0) {
    pf.alive = false;
    pf.mesh.visible = false;
    G.addWanted(1, 'took down an officer');
    G.feed('Officer down! The heat is on.');
  }
}

export function updateCombat(G, dt) {
  const c = G.combat;
  if (c.fireCooldown > 0) c.fireCooldown -= dt;
  if (c.meleeCooldown > 0) c.meleeCooldown -= dt;
  for (const t of c.tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  if (c.flashLife > 0) {
    c.flashLife -= dt;
    c.flash.material.opacity = Math.max(0, c.flashLife / 0.06);
  }
  // Rival health bars face the camera.
  for (const r of G.rivals) {
    if (!r.hpBar) continue;
    r.hpBar.visible = r.alive;
    if (r.alive) {
      r.hpBar.position.copy(r.pos).add(new THREE.Vector3(0, 2.5, 0));
      r.hpBar.lookAt(G.camera.position);
      const fill = r.hpBar.getObjectByName('fill');
      if (fill) {
        fill.scale.x = clamp(r.hp / r.maxHp, 0, 1);
        fill.position.x = -(1 - clamp(r.hp / r.maxHp, 0, 1)) * 0.55;
      }
      const mat = r.mesh.children.find((ch) => ch.name === 'body');
      if (mat && r.flash > 0) { r.flash -= dt; }
    }
  }
}
