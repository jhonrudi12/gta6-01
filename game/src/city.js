// city.js — builds Solmar City: street grid, varied towers with lit
// windows, palm trees, a south beach and sea, warm sun, gradient sky and
// drifting clouds. Buildings are shared-geometry boxes so ~120 towers cost
// almost nothing. Also owns the collision boxes and the landmark spots
// (hospital, Lena's garage, safehouse, harbour dock) the missions use.
import * as THREE from 'three';
import { randRange, pick } from './util.js';

export const STREETS = [-120, -80, -40, 0, 40, 80, 120];
export const CITY_EDGE = 150;
export const BEACH_Z = 150;
export const SEA_Z = 178;

const PALETTE = [0xd8c9a3, 0xc9b18c, 0xb7a6c9, 0x9fb8c8, 0xd9a441, 0xc97b4a, 0x8fb0a0, 0xe0d6c2, 0xa8b6c4, 0xd98c7a];
const WINDOW_COLORS = [0xffe9a8, 0x9fd8ff, 0xfff2c0];

export function buildCity(G) {
  const rng = G.rng;
  const scene = G.scene;
  const city = { buildings: [], palms: [], pickups: [] };

  // Warm afternoon light.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdf9e, 1.6);
  sun.position.set(90, 140, 60);
  scene.add(sun);
  scene.fog = new THREE.Fog(0xf7c98a, 220, 520);

  // Gradient sky dome (big sphere, shader-free vertex colours).
  const skyGeo = new THREE.SphereGeometry(600, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false });
  const pos = skyGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x3f7fd0), mid = new THREE.Color(0x9ec8ee), low = new THREE.Color(0xffc98a);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 600;
    const c = y > 0.25 ? top.clone().lerp(mid, 1 - (y - 0.25) * 1.2) : mid.clone().lerp(low, 1 - (y + 0.1) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Sun disc + a few soft clouds.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(22, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false })
  );
  sunDisc.position.set(180, 210, -260);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  G.clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(cloudGeo, cloudMat);
      m.scale.set(randRange(rng, 8, 18), randRange(rng, 3, 5), randRange(rng, 6, 10));
      m.position.set(p * randRange(rng, 8, 12) - puffs * 5, randRange(rng, -1, 1), randRange(rng, -4, 4));
      cloud.add(m);
    }
    cloud.position.set(randRange(rng, -280, 280), randRange(rng, 90, 140), randRange(rng, -280, 120));
    scene.add(cloud);
    G.clouds.push(cloud);
  }

  // Ground: city asphalt base, then sand strip, then sea.
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(340, 340), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);
  const sandMat = new THREE.MeshLambertMaterial({ color: 0xe8d29a });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(340, 42), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, BEACH_Z + 16);
  scene.add(sand);
  const seaMat = new THREE.MeshLambertMaterial({ color: 0x2e7fb8 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(340, 160), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, SEA_Z + 80);
  scene.add(sea);
  G.sea = sea;

  // Roads: dark strips along every street line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  for (const s of STREETS) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 310), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? s : 0, 0.03, vertical ? 0 : s);
      if (!vertical) road.rotation.z = 0;
      // PlaneGeometry is (width=x, height=y); rotate so length runs along the street.
      road.rotation.set(-Math.PI / 2, 0, vertical ? Math.PI / 2 : 0);
      road.position.set(vertical ? s : 0, 0.03, vertical ? 0 : s);
      scene.add(road);
    }
  }
  // Centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8c8 });
  const dashGeo = new THREE.BoxGeometry(0.4, 0.02, 3);
  for (const s of STREETS) {
    for (let t = -140; t <= 140; t += 12) {
      const d1 = new THREE.Mesh(dashGeo, dashMat);
      d1.position.set(s, 0.05, t);
      scene.add(d1);
      const d2 = new THREE.Mesh(dashGeo, dashMat);
      d2.rotation.y = Math.PI / 2;
      d2.position.set(t, 0.05, s);
      scene.add(d2);
    }
  }
  // Sidewalk strips along roads (lighter, slightly raised).
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a3 });
  for (const s of STREETS) {
    for (const off of [-7, 7]) {
      const w1 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 300), walkMat);
      w1.rotation.x = -Math.PI / 2; w1.position.set(s + off, 0.06, 0); scene.add(w1);
      const w2 = new THREE.Mesh(new THREE.PlaneGeometry(300, 3.4), walkMat);
      w2.rotation.x = -Math.PI / 2; w2.position.set(0, 0.06, s + off); scene.add(w2);
    }
  }

  // Buildings: one shared box geometry, per-tower scale + colour, plus a
  // lit-window slab on the front face so the skyline reads at a glance.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const winGeo = new THREE.PlaneGeometry(1, 1);
  const winMats = WINDOW_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const towerMats = PALETTE.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  let towerCount = 0;
  for (let bx = 0; bx < STREETS.length - 1; bx++) {
    for (let bz = 0; bz < STREETS.length - 1; bz++) {
      const cx = (STREETS[bx] + STREETS[bx + 1]) / 2;
      const cz = (STREETS[bz] + STREETS[bz + 1]) / 2;
      // Keep the garage corner, hospital corner and dock approach clear.
      if (cx < -95 && cz < -95) continue;
      if (cx < -95 && cz > 95) continue;
      const slots = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
      for (const [ox, oz] of slots) {
        if (rng() < 0.18) continue; // gaps, plazas, parking lots
        const w = randRange(rng, 10, 16), d = randRange(rng, 10, 16);
        const h = randRange(rng, 8, 52) * (rng() < 0.12 ? 1.8 : 1);
        const x = cx + ox, z = cz + oz;
        const mat = pick(rng, towerMats);
        const tower = new THREE.Mesh(boxGeo, mat);
        tower.scale.set(w, h, d);
        tower.position.set(x, h / 2, z);
        scene.add(tower);
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.scale.set(w * 0.92, 0.8, d * 0.92);
        roof.position.set(x, h + 0.4, z);
        scene.add(roof);
        // Window slab on the south face.
        const win = new THREE.Mesh(winGeo, pick(rng, winMats));
        win.scale.set(w * 0.62, h * 0.7, 1);
        win.position.set(x, h * 0.52, z + d / 2 + 0.06);
        scene.add(win);
        const win2 = win.clone();
        win2.rotation.y = Math.PI;
        win2.position.set(x, h * 0.52, z - d / 2 - 0.06);
        scene.add(win2);
        city.buildings.push({ x, z, w, d, h });
        towerCount++;
      }
    }
  }
  G.buildingCount = towerCount;

  // Palm trees along the beach and scattered on sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
  const leafGeo = new THREE.ConeGeometry(2.6, 3.4, 6);
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3; trunk.rotation.z = randRange(rng, -0.08, 0.08);
    g.add(trunk);
    const leaves = new THREE.Mesh(leafGeo, leafMat);
    leaves.position.y = 7.2; leaves.scale.y = 0.8;
    g.add(leaves);
    g.position.set(x, 0, z);
    scene.add(g);
    city.palms.push(g);
  }
  for (let x = -160; x <= 160; x += 16) { palm(x + randRange(rng, -3, 3), BEACH_Z + randRange(rng, 4, 12)); }
  for (let i = 0; i < 26; i++) {
    const s = pick(rng, STREETS);
    palm(s + (rng() < 0.5 ? -8.5 : 8.5), randRange(rng, -130, 130));
  }

  // Landmark props: Lena's garage (big roller-door box), hospital (white
  // block with cross), safehouse (small house), harbour dock (wooden pier).
  function landmarkBox(x, z, w, h, d, color) {
    const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color }));
    m.scale.set(w, h, d); m.position.set(x, h / 2, z);
    scene.add(m);
    city.buildings.push({ x, z, w, d, h });
    return m;
  }
  landmarkBox(-112, -112, 26, 9, 18, 0x7a4a3a); // Lena's garage
  const hosp = landmarkBox(-112, 112, 30, 16, 20, 0xe8e8e8); // hospital
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xd23c2e });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 0.6), crossMat);
  crossV.position.set(-112, 20, 122.2); scene.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 0.6), crossMat);
  crossH.position.set(-112, 20, 122.2); scene.add(crossH);
  landmarkBox(-128, 128, 14, 7, 12, 0x6a8a5a); // safehouse
  // Harbour dock: pier planks out over the sand at the south-east.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9a7b52 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 46), pierMat);
  pier.position.set(128, 0.6, 168);
  scene.add(pier);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x6b4f30 });
  for (const [px, pz] of [[118, 150], [138, 150], [118, 186], [138, 186]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 6), postMat);
    post.position.set(px, 1.2, pz); scene.add(post);
  }
  // A few crates on the dock for cover.
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb08a4a });
  for (const [cx, cz, s] of [[118, 172, 2.4], [136, 176, 2.8], [126, 180, 2.0], [134, 164, 2.2]]) {
    const crate = new THREE.Mesh(boxGeo, crateMat);
    crate.scale.set(s, s, s); crate.position.set(cx, s / 2, cz);
    scene.add(crate);
    city.buildings.push({ x: cx, z: cz, w: s, d: s, h: s });
  }

  G.city = city;
  G.landmarks = {
    garage: new THREE.Vector3(-112, 0, -100),
    hospital: new THREE.Vector3(-100, 0, 96),
    safehouse: new THREE.Vector3(-128, 0, 116),
    dock: new THREE.Vector3(128, 0, 168),
    beach: new THREE.Vector3(20, 0, 168),
  };
  return city;
}

// Circle (radius r) vs building AABB push-out. Returns true if pushed.
export function collideBuildings(G, x, z, r) {
  let hit = false;
  for (const b of G.city.buildings) {
    const hw = b.w / 2 + r, hd = b.d / 2 + r;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
      const px = hw - Math.abs(dx), pz = hd - Math.abs(dz);
      if (px < pz) x = b.x + (dx > 0 ? hw : -hw);
      else z = b.z + (dz > 0 ? hd : -hd);
      hit = true;
    }
  }
  return { x, z, hit };
}

export function clampToWorld(x, z) {
  return {
    x: Math.max(-168, Math.min(168, x)),
    z: Math.max(-168, Math.min(196, z)),
  };
}
