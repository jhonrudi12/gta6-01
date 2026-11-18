// peds.js — pedestrians strolling the sidewalks, scattering when shots
// ring out, plus the fleeing drivers from stolen cars.
import * as THREE from 'three';
import { randRange, pick, dist2D } from './util.js';
import { STREETS, collideBuildings, clampToWorld } from './city.js';

const SHIRTS = [0xe8b820, 0x3aa84f, 0xd97b2e, 0x8a5fc0, 0x4fb0c8, 0xd23c6e, 0xe8e8e8, 0x5a7a3a];
const SKINS = [0xd9a066, 0x8a5a30, 0xe8b88a, 0x6b4423];

export function makePedMesh(shirt, skin) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.66, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.05; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.62; g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.22), legMat);
  legL.position.set(-0.14, 0.36, 0); legL.name = 'legL'; g.add(legL);
  const legR = legL.clone(); legR.name = 'legR'; legR.position.x = 0.14; g.add(legR);
  return g;
}

export function spawnPeds(G) {
  G.peds = [];
  for (let i = 0; i < 24; i++) {
    const mesh = makePedMesh(pick(G.rng, SHIRTS), pick(G.rng, SKINS));
    G.scene.add(mesh);
    const street = pick(G.rng, STREETS);
    const vertical = G.rng() < 0.5;
    const side = G.rng() < 0.5 ? -8.6 : 8.6;
    const along = randRange(G.rng, -140, 140);
    const ped = {
      mesh, alive: true, fleeing: null, speed: randRange(G.rng, 1.2, 2.2),
      vertical, street, side, along, dir: G.rng() < 0.5 ? 1 : -1,
      pos: new THREE.Vector3(0, 0, 0), phase: randRange(G.rng, 0, 6), respawnIn: 0,
    };
    syncPedPos(ped);
    G.peds.push(ped);
  }
}

function syncPedPos(ped) {
  if (ped.vertical) ped.pos.set(ped.street + ped.side, 0, ped.along);
  else ped.pos.set(ped.along, 0, ped.street + ped.side);
  ped.mesh.position.copy(ped.pos);
}

export function updatePeds(G, dt) {
  const p = G.player.pos;
  for (const ped of G.peds) {
    if (!ped.alive) {
      ped.respawnIn -= dt;
      if (ped.respawnIn <= 0) {
        ped.alive = true; ped.fleeing = null; ped.mesh.visible = true;
        ped.along = randRange(G.rng, -140, 140);
        ped.street = pick(G.rng, STREETS);
        syncPedPos(ped);
      }
      continue;
    }
    // Flee: gunfire nearby, or the player sprinting at them in a car.
    const d = dist2D(ped.pos.x, ped.pos.z, p.x, p.z);
    if (G.gunshotAt && dist2D(ped.pos.x, ped.pos.z, G.gunshotAt.x, G.gunshotAt.z) < 26) {
      ped.fleeing = 'gunfire';
      ped.fleeDir = Math.atan2(ped.pos.x - G.gunshotAt.x, ped.pos.z - G.gunshotAt.z);
    } else if (!G.player.onFoot && d < 9) {
      ped.fleeing = 'car';
      ped.fleeDir = Math.atan2(ped.pos.x - p.x, ped.pos.z - p.z);
    } else if (ped.fleeing === 'gunfire' || ped.fleeing === 'car') {
      if (d > 30) {
        ped.fleeing = null;
        // Resume the sidewalk stroll from wherever the panic ended.
        if (ped.vertical) ped.along = ped.pos.z;
        else ped.along = ped.pos.x;
      }
    }
    if (ped.fleeing === 'driver') {
      // A stolen car's driver just runs straight away from the car.
      ped.along += ped.speed * 2.4 * dt * ped.dir;
      syncPedPos(ped);
      if (Math.abs(ped.along) > 145) { ped.alive = false; ped.mesh.visible = false; ped.respawnIn = 12; }
      continue;
    }
    if (ped.fleeing) {
      const sp = 5.2;
      ped.pos.x += Math.sin(ped.fleeDir) * sp * dt;
      ped.pos.z += Math.cos(ped.fleeDir) * sp * dt;
      const cl = clampToWorld(ped.pos.x, ped.pos.z);
      const pushed = collideBuildings(G, cl.x, cl.z, 0.6);
      ped.pos.x = pushed.x; ped.pos.z = pushed.z;
      ped.mesh.position.copy(ped.pos);
      ped.mesh.rotation.y = ped.fleeDir;
      ped.phase += dt * 12;
    } else {
      ped.along += ped.dir * ped.speed * dt;
      if (ped.along > 142) { ped.along = 142; ped.dir = -1; }
      if (ped.along < -142) { ped.along = -142; ped.dir = 1; }
      syncPedPos(ped);
      const heading = ped.vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.mesh.rotation.y = heading;
      ped.phase += dt * 7;
    }
    const legL = ped.mesh.getObjectByName('legL'), legR = ped.mesh.getObjectByName('legR');
    const sw = Math.sin(ped.phase) * 0.5;
    if (legL) legL.rotation.x = sw;
    if (legR) legR.rotation.x = -sw;
  }
  if (G.gunshotAt) G.gunshotTimer -= dt;
  if (G.gunshotTimer <= 0) G.gunshotAt = null;
}
