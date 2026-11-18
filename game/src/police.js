// police.js — the wanted system and the police who answer it. Stars rise
// on crimes (stealing, hitting pedestrians, shooting, killing officers) and
// fade when the player lies low. Patrol cars ram the player; foot officers
// chase on foot once the heat is high enough.
import * as THREE from 'three';
import { randRange, pick, angleDiff, clamp, dist2D } from './util.js';
import { STREETS, collideBuildings, clampToWorld } from './city.js';
import { makeCarMesh } from './vehicles.js';
import { makePedMesh } from './peds.js';

export function createPolice(G) {
  G.policeCars = [];
  G.policeFoot = [];
  G.wanted = 0;
  G.wantedTimer = 0;
  G.crimeCooldown = 0;
  G.spawnTimer = 0;
}

export function addWanted(G, stars, reason) {
  if (G.crimeCooldown > 0 && stars <= 1) return;
  G.wanted = clamp(G.wanted + stars, 0, 5);
  G.wantedTimer = 0;
  G.crimeCooldown = 1.2;
  G.hudDirty = true;
  if (reason) G.feed('Wanted level ' + G.wanted + ' — ' + reason + '.');
}

export function updateWanted(G, dt) {
  if (G.crimeCooldown > 0) G.crimeCooldown -= dt;
  // Lie low and the heat fades: one star every 14 quiet seconds.
  if (G.wanted > 0) {
    G.wantedTimer += dt;
    if (G.wantedTimer > 14) { G.wantedTimer = 0; G.wanted--; G.hudDirty = true; }
  }
  // Spawn patrol cars to match the wanted level (max 5 on the road).
  G.spawnTimer -= dt;
  const wantCars = G.wanted >= 1 ? Math.min(G.wanted + 1, 4) : 0;
  if (wantCars > G.policeCars.length && G.spawnTimer <= 0) {
    G.spawnTimer = 2.5;
    spawnPoliceCar(G);
  }
  if (G.wanted === 0) {
    // Stand down: patrol cars drive off and foot officers walk away.
    for (const pc of G.policeCars) { G.scene.remove(pc.mesh); }
    G.policeCars = [];
    for (const pf of G.policeFoot) { G.scene.remove(pf.mesh); }
    G.policeFoot = [];
  }
  // Foot officers join at wanted 2+.
  const wantFoot = G.wanted >= 2 ? Math.min(G.wanted - 1, 3) : 0;
  if (wantFoot > G.policeFoot.length && G.spawnTimer <= 0) {
    G.spawnTimer = 2.5;
    spawnFootOfficer(G);
  }
  updatePoliceCars(G, dt);
  updateFootOfficers(G, dt);
}

function spawnPoliceCar(G) {
  const p = G.player.pos;
  const ang = G.rng() * Math.PI * 2;
  const x = clamp(p.x + Math.sin(ang) * 45, -145, 145);
  const z = clamp(p.z + Math.cos(ang) * 45, -145, 145);
  return spawnPoliceCarAt(G, x, z);
}

// Spawn a patrol car at an exact spot (used by the chase screenshot preset).
export function spawnPoliceCarAt(G, x, z) {
  const mesh = makeCarMesh(0x1a1a22, true);
  G.scene.add(mesh);
  mesh.position.set(x, 0, z);
  const car = { mesh, speed: 0, heading: 0, hitCooldown: 0, sirenPhase: G.rng() * 6 };
  G.policeCars.push(car);
  return car;
}

function updatePoliceCars(G, dt) {
  const p = G.player;
  for (const pc of G.policeCars) {
    const dx = p.pos.x - pc.mesh.position.x;
    const dz = p.pos.z - pc.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    pc.heading += clamp(angleDiff(pc.heading, wantHeading), -1.9 * dt, 1.9 * dt);
    const targetSpeed = d > 6 ? 26 : 12;
    pc.speed += clamp(targetSpeed - pc.speed, -20 * dt, 12 * dt);
    const nx = pc.mesh.position.x + Math.sin(pc.heading) * pc.speed * dt;
    const nz = pc.mesh.position.z + Math.cos(pc.heading) * pc.speed * dt;
    const cl = clampToWorld(nx, nz);
    const pushed = collideBuildings(G, cl.x, cl.z, 1.6);
    if (pushed.hit) pc.speed *= 0.5;
    pc.mesh.position.x = pushed.x;
    pc.mesh.position.z = pushed.z;
    pc.mesh.rotation.y = pc.heading;
    // Ram: damage the player (or their car) on contact.
    if (pc.hitCooldown > 0) pc.hitCooldown -= dt;
    if (d < 3.6 && pc.hitCooldown <= 0) {
      pc.hitCooldown = 1.2;
      pc.speed *= 0.4;
      if (p.car) p.car.speed *= 0.5;
      G.hurtPlayer(9, 'rammed by a patrol car');
      G.feed('Patrol car rammed you!');
    }
    // Flash the light bar.
    const beacon = pc.mesh.getObjectByName('beacon');
    if (beacon) {
      pc.sirenPhase += dt * 6;
      beacon.material.color.setHex(Math.sin(pc.sirenPhase) > 0 ? 0xff2222 : 0x2244ff);
    }
  }
}

function spawnFootOfficer(G) {
  const mesh = makePedMesh(0x1a2a5a, 0xd9a066);
  // A cap so officers read as police at a glance.
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x0a0a14 }));
  cap.position.y = 1.86; mesh.add(cap);
  G.scene.add(mesh);
  const p = G.player.pos;
  const ang = G.rng() * Math.PI * 2;
  const x = clamp(p.x + Math.sin(ang) * 18, -145, 145);
  const z = clamp(p.z + Math.cos(ang) * 18, -145, 145);
  mesh.position.set(x, 0, z);
  G.policeFoot.push({ mesh, pos: mesh.position, hp: 50, hitCooldown: 0, phase: 0, alive: true });
}

function updateFootOfficers(G, dt) {
  const p = G.player;
  for (const pf of G.policeFoot) {
    if (!pf.alive) continue;
    const dx = p.pos.x - pf.pos.x, dz = p.pos.z - pf.pos.z;
    const d = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    pf.pos.x += Math.sin(heading) * 6.5 * dt;
    pf.pos.z += Math.cos(heading) * 6.5 * dt;
    pf.mesh.rotation.y = heading;
    pf.phase += dt * 11;
    const legL = pf.mesh.getObjectByName('legL'), legR = pf.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = Math.sin(pf.phase) * 0.6;
    if (legR) legR.rotation.x = -Math.sin(pf.phase) * 0.6;
    if (pf.hitCooldown > 0) pf.hitCooldown -= dt;
    if (d < 1.8 && pf.hitCooldown <= 0) {
      pf.hitCooldown = 1.1;
      G.hurtPlayer(8, 'beaten by an officer');
    }
    // Run over by the player's car.
    if (p.car && d < 2.2 && Math.abs(p.car.speed) > 4) {
      pf.alive = false;
      pf.mesh.visible = false;
      G.addWanted(1, 'ran over an officer');
      G.feed('You ran over an officer! Wanted level up.');
    }
  }
  G.policeFoot = G.policeFoot.filter((pf) => pf.alive || pf.mesh.visible);
}
