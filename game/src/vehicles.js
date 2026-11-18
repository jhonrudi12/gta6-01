// vehicles.js — car models, arcade driving physics, traffic AI and the
// steal-a-car flow. One shared car builder makes traffic cars, police cars
// and the player's stolen ride; colours and a light bar tell them apart.
import * as THREE from 'three';
import { randRange, pick, angleDiff, clamp, dist2D } from './util.js';
import { STREETS, collideBuildings, clampToWorld } from './city.js';

const CAR_COLORS = [0xd23c2e, 0x2e6fd2, 0xe8b820, 0x3aa84f, 0x8a5fc0, 0xe8e8e8, 0x222222, 0xd97b2e, 0x4fb0c8];
const WHEEL_GEO = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
const WHEEL_MAT = new THREE.MeshLambertMaterial({ color: 0x141414 });

export function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabinMat = new THREE.MeshLambertMaterial({ color: police ? 0x1a1a1a : 0x222831 });
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), cabinMat);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.3, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x9fd8ff })
  );
  glass.position.set(0, 1.1, 0.85);
  g.add(glass);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(WHEEL_GEO, WHEEL_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  // Headlights + taillights.
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), hl);
    h.position.set(hx, 0.7, 2.22); g.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xd23c2e });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tl);
    t.position.set(hx, 0.7, -2.22); g.add(t);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2233aa }));
    bar.position.set(0, 1.55, -0.25);
    g.add(bar);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    beacon.position.set(0, 1.56, -0.25);
    beacon.name = 'beacon';
    g.add(beacon);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.85;
    g.add(stripe);
  }
  return g;
}

export function spawnTraffic(G) {
  G.cars = [];
  for (let i = 0; i < 14; i++) {
    const color = pick(G.rng, CAR_COLORS);
    const mesh = makeCarMesh(color, false);
    G.scene.add(mesh);
    const vertical = G.rng() < 0.5;
    const street = pick(G.rng, STREETS);
    const dir = G.rng() < 0.5 ? 1 : -1;
    const lane = dir > 0 ? 2.5 : -2.5;
    const car = {
      mesh, vertical, dir, speed: randRange(G.rng, 7, 12), maxSpeed: randRange(G.rng, 9, 14),
      laneCoord: street, along: randRange(G.rng, -140, 140),
      lane: dir > 0 ? 2.5 : -2.5,
      color, kind: 'traffic', driver: null, id: i,
    };
    // A driver figure sits in each traffic car so stealing one has a visible
    // person who jumps out and runs.
    const driver = new THREE.Group();
    const dm = new THREE.MeshLambertMaterial({ color: pick(G.rng, [0xe8b820, 0x3aa84f, 0xd97b2e, 0x8a5fc0]) });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), dm);
    torso.position.y = 1.05; driver.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
    head.position.y = 1.5; driver.add(head);
    driver.position.set(0.45, 0, 0.2);
    mesh.add(driver);
    car.driver = driver;
    G.cars.push(car);
  }
}

function carPos(car) {
  if (car.vertical) return { x: car.laneCoord + car.lane, z: car.along };
  return { x: car.along, z: car.laneCoord + car.lane };
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (car.kind === 'player') continue;
    // Slow down for the car ahead on the same lane.
    let target = car.maxSpeed;
    for (const other of G.cars) {
      if (other === car || other.vertical !== car.vertical || other.laneCoord !== car.laneCoord) continue;
      const gap = (other.along - car.along) * car.dir;
      if (gap > 0 && gap < 9) { target = 0; break; }
      if (gap > 0 && gap < 16) { target = Math.min(target, car.maxSpeed * 0.45); }
    }
    // Slow near the player so traffic feels alive instead of ghosting through.
    const p = G.player.pos;
    const cp = carPos(car);
    if (dist2D(cp.x, cp.z, p.x, p.z) < 7) target = Math.min(target, car.maxSpeed * 0.5);
    car.speed += clamp(target - car.speed, -18 * dt, 8 * dt);
    car.along += car.dir * car.speed * dt;
    if (car.along > 148) { car.along = 148; car.dir = -1; car.lane = -2.5; }
    if (car.along < -148) { car.along = -148; car.dir = 1; car.lane = 2.5; }
    const pos = carPos(car);
    car.mesh.position.set(pos.x, 0, pos.z);
    const heading = car.vertical ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.mesh.rotation.y = heading;
  }
}

// --- Player driving (arcade physics) ------------------------------------
export function drivePlayerCar(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const k = G.keys;
  const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  const steerIn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
  const maxF = 30, maxR = 11;
  if (fwd > 0) car.speed += 16 * dt;
  else if (fwd < 0) car.speed -= (car.speed > 0.5 ? 26 : 12) * dt;
  else car.speed -= Math.sign(car.speed) * 7 * dt;
  if (Math.abs(car.speed) < 0.15 && fwd === 0) car.speed = 0;
  car.speed = clamp(car.speed, -maxR, maxF);
  const steer = steerIn * 0.55 * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.heading += steer * (car.speed / 10) * dt * (car.speed >= 0 ? 1 : -1) * 2.2;
  const nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
  const clamped = clampToWorld(nx, nz);
  const pushed = collideBuildings(G, clamped.x, clamped.z, 1.6);
  if (pushed.hit) car.speed *= 0.55;
  car.mesh.position.x = pushed.x;
  car.mesh.position.z = pushed.z;
  car.mesh.rotation.y = car.heading;
  p.pos.set(pushed.x, 0, pushed.z);
  p.yaw = car.heading;
  // Bumping traffic cars: shove them and slow down a little.
  for (const other of G.cars) {
    if (other === car || other.kind === 'player') continue;
    const op = carPos(other);
    if (dist2D(pushed.x, pushed.z, op.x, op.z) < 3.4) {
      other.along += other.dir * 6 * dt;
      car.speed *= 0.92;
      if (Math.abs(car.speed) > 6 && !G.bumpCooldown) {
        G.bumpCooldown = 0.6;
        G.audio.horn();
      }
    }
  }
  // Running over a pedestrian is a crime.
  for (const ped of G.peds) {
    if (!ped.alive || ped.fleeing === 'dead') continue;
    if (dist2D(pushed.x, pushed.z, ped.pos.x, ped.pos.z) < 2.0 && Math.abs(car.speed) > 3) {
      runOverPed(G, ped);
    }
  }
  G.audio.engine(Math.abs(car.speed) / 30, true);
}

function runOverPed(G, ped) {
  ped.alive = false;
  ped.fleeing = 'dead';
  ped.mesh.visible = false;
  ped.respawnIn = 14;
  G.addWanted(1, 'hit a pedestrian');
  G.feed('You ran over a pedestrian! The police are coming.');
  G.damageFlash();
}

// E to steal the nearest traffic car.
export function tryStealCar(G) {
  const p = G.player;
  if (p.car) return false;
  let best = null, bestD = 4.2;
  for (const car of G.cars) {
    if (car.kind !== 'traffic') continue;
    const cp = carPos(car);
    const d = dist2D(p.pos.x, p.pos.z, cp.x, cp.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  // Driver jumps out and runs away on foot.
  if (best.driver) {
    const flee = { pos: new THREE.Vector3(best.mesh.position.x, 0, best.mesh.position.z), alive: true, fleeing: 'driver', mesh: best.driver, speed: 6, dir: G.rng() < 0.5 ? 1 : -1, respawnIn: 0,
      vertical: true, street: best.mesh.position.x, side: 0, along: best.mesh.position.z, phase: 0 };
    best.driver.visible = true;
    best.driver.parent.remove(best.driver);
    best.driver.position.copy(flee.pos);
    G.scene.add(best.driver);
    G.peds.push(flee);
    best.driver = null;
  }
  best.kind = 'player';
  best.speed = 0;
  best.heading = best.mesh.rotation.y;
  p.car = best;
  p.onFoot = false;
  p.pos.copy(best.mesh.position);
  G.addWanted(1, 'stole a car');
  G.feed('You stole the car! Lena is waiting — get to her garage.');
  G.audio.horn();
  G.missions.onStealCar(G);
  return true;
}

// F to leave the car on foot.
export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.kind = 'traffic';
  car.vertical = Math.abs(Math.sin(car.heading)) < 0.7;
  car.laneCoord = car.vertical ? Math.round(car.mesh.position.x / 40) * 40 : Math.round(car.mesh.position.z / 40) * 40;
  car.laneCoord = STREETS.reduce((a, b) => Math.abs(b - car.laneCoord) < Math.abs(a - car.laneCoord) ? b : a, 0);
  car.lane = 2.5;
  car.dir = 1;
  car.along = car.vertical ? car.mesh.position.z : car.mesh.position.x;
  car.maxSpeed = 10;
  car.speed = 0;
  p.car = null;
  p.onFoot = true;
  const side = Math.cos(car.heading);
  p.pos.set(car.mesh.position.x + 2.6, 0, car.mesh.position.z);
  p.pos.x = Math.max(-168, Math.min(168, p.pos.x));
  G.feed('You left the car.');
}
