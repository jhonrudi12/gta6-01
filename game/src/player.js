// player.js — on-foot third-person movement, jumping, the orbit camera
// and the little blocky character. WASD moves relative to the camera,
// Shift runs, Space jumps, dragging the mouse orbits the camera.
import * as THREE from 'three';
import { clamp, dist2D } from './util.js';
import { collideBuildings, clampToWorld } from './city.js';

export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e6fd2 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  body.position.y = 1.12; body.name = 'body'; g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.72; g.add(head);
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), hair);
  hairM.position.y = 1.95; g.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.26), pants);
  legL.position.set(-0.16, 0.42, 0); legL.name = 'legL'; g.add(legL);
  const legR = legL.clone(); legR.name = 'legR'; legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), shirt);
  armL.position.set(-0.42, 1.15, 0); armL.name = 'armL'; g.add(armL);
  const armR = armL.clone(); armR.name = 'armR'; armR.position.x = 0.42; g.add(armR);
  // A simple pistol in the right hand when armed.
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 0.88, 0.2); gun.name = 'gun'; gun.visible = false;
  g.add(gun);
  return g;
}

export function createPlayer(G) {
  const mesh = makePlayerMesh();
  G.scene.add(mesh);
  G.player = {
    pos: new THREE.Vector3(0, 0, 30),
    yaw: Math.PI,
    camYaw: Math.PI, camPitch: 0.32,
    velY: 0, grounded: true,
    onFoot: true, car: null,
    hp: 100, maxHp: 100,
    weapon: 'fist',
    walkPhase: 0, moving: false,
    mesh,
  };
  return G.player;
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (!p.onFoot) return;
  const k = G.keys;
  let ix = 0, iz = 0;
  if (k.has('KeyW') || k.has('ArrowUp')) iz += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) iz -= 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
  const run = k.has('ShiftLeft') || k.has('ShiftRight');
  const speed = run ? 9.5 : 5.2;
  const len = Math.hypot(ix, iz);
  p.moving = len > 0;
  if (len > 0) {
    ix /= len; iz /= len;
    // Camera-relative: forward is where the camera looks on the ground.
    const cy = p.camYaw;
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = Math.cos(cy), rz = -Math.sin(cy);
    const mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
    const nx = p.pos.x + mx * speed * dt;
    const nz = p.pos.z + mz * speed * dt;
    const cl = clampToWorld(nx, nz);
    const pushed = collideBuildings(G, cl.x, cl.z, 0.7);
    p.pos.x = pushed.x; p.pos.z = pushed.z;
    p.yaw = Math.atan2(mx, mz);
    p.walkPhase += dt * (run ? 13 : 9);
    // Pickups.
    checkPickups(G);
  }
  // Jump + gravity.
  if ((k.has('Space')) && p.grounded) { p.velY = 7.5; p.grounded = false; }
  if (!p.grounded || p.pos.y > 0) {
    p.velY -= 22 * dt;
    p.pos.y += p.velY * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; p.velY = 0; p.grounded = true; }
  }
  // Animate the walk.
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.55 : 0;
  const legL = p.mesh.getObjectByName('legL'), legR = p.mesh.getObjectByName('legR');
  const armL = p.mesh.getObjectByName('armL'), armR = p.mesh.getObjectByName('armR');
  if (legL) legL.rotation.x = swing;
  if (legR) legR.rotation.x = -swing;
  if (armL) armL.rotation.x = -swing * 0.7;
  if (armR) armR.rotation.x = swing * 0.7;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.y = p.yaw;
  const gun = p.mesh.getObjectByName('gun');
  if (gun) gun.visible = p.weapon === 'pistol';
  G.audio.engine(0, false);
}

function checkPickups(G) {
  const p = G.player;
  for (const pk of G.pickups) {
    if (!pk.active) continue;
    if (dist2D(p.pos.x, p.pos.z, pk.pos.x, pk.pos.z) < 2.2) {
      pk.active = false;
      pk.mesh.visible = false;
      if (pk.kind === 'cash') {
        G.money += pk.value;
        G.audio.cash();
        G.feed('Picked up ' + '$' + pk.value + ' in street cash.');
      } else {
        p.hp = Math.min(p.maxHp, p.hp + 40);
        G.audio.pickup();
        G.feed('Health pack: +40 HP.');
      }
      G.hudDirty = true;
    }
  }
}

export function spawnPickups(G) {
  G.pickups = [];
  const cashMat = new THREE.MeshLambertMaterial({ color: 0x2fae4e });
  const hpMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const boxGeo = new THREE.BoxGeometry(0.7, 0.5, 0.7);
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xd23c2e });
  const spots = [
    [18, -62, 'cash', 150], [-62, 18, 'cash', 150], [62, -18, 'cash', 200],
    [-18, 62, 'cash', 150], [102, 62, 'cash', 250], [-102, -18, 'cash', 200],
    [42, 102, 'cash', 150], [-42, -102, 'cash', 250],
    [6, -6, 'health', 0], [-58, -58, 'health', 0], [58, 58, 'health', 0],
    [102, -102, 'health', 0], [-102, 102, 'health', 0],
  ];
  for (const [x, z, kind, value] of spots) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(boxGeo, kind === 'cash' ? cashMat : hpMat);
    box.position.y = 0.5; g.add(box);
    if (kind === 'health') {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.1), crossMat);
      c1.position.set(0, 0.5, 0.38); g.add(c1);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.1), crossMat);
      c2.position.set(0, 0.5, 0.38); g.add(c2);
    }
    g.position.set(x, 0, z);
    G.scene.add(g);
    G.pickups.push({ kind, value, pos: new THREE.Vector3(x, 0, z), mesh: g, active: true, spin: 0 });
  }
}

export function updateCamera(G, dt) {
  const p = G.player;
  const aiming = p.onFoot && p.weapon === 'pistol' && G.state === 'playing';
  // The camera always orbits the player: its position comes from the
  // player's anchor, never from the aim point, or it would slide forward
  // onto the player and hide them. Only the look target moves when aiming.
  const anchor = p.onFoot
    ? p.pos.clone().add(new THREE.Vector3(0, 1.6, 0))
    : p.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
  const lookTarget = aiming
    ? new THREE.Vector3(p.pos.x + Math.sin(p.camYaw) * 8, 1.4, p.pos.z + Math.cos(p.camYaw) * 8)
    : anchor;
  const dist = p.onFoot ? 7.5 : 10.5;
  const pitch = clamp(p.camPitch, -0.15, 1.1);
  const cy = p.camYaw;
  const cx = anchor.x - Math.sin(cy) * Math.cos(pitch) * dist;
  const cz = anchor.z - Math.cos(cy) * Math.cos(pitch) * dist;
  const cyPos = anchor.y + Math.sin(pitch) * dist + 1.2;
  // Simple collision: raise the camera if a building sits between.
  let camY = cyPos;
  for (const b of G.city.buildings) {
    if (Math.abs(cx - b.x) < b.w / 2 && Math.abs(cz - b.z) < b.d / 2 && camY < b.h) camY = b.h + 1.5;
  }
  G.camera.position.set(cx, camY, cz);
  G.camera.lookAt(lookTarget);
}
