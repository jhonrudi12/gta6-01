// missions.js — the three-mission story chain for Marco Solis and his
// fixer Lena Cruz, plus the free-roam epilogue. Each mission sets an
// objective line, a 3D beacon in the world and a HUD target; completing one
// pays out and starts the next.
import * as THREE from 'three';
import { dist2D, moneyStr } from './util.js';
import { makePedMesh } from './peds.js';

export const MISSION_DEFS = [
  {
    id: 'M1', name: 'First Wheels',
    brief: 'Lena needs wheels. Steal any car and bring it to her garage.',
    reward: 500,
  },
  {
    id: 'M2', name: 'Bayfront Drop',
    brief: 'Deliver the package to the beach marker before the timer runs out. Cops are already watching.',
    reward: 800,
  },
  {
    id: 'M3', name: 'Harbor Heat',
    brief: 'Rival crew is holding the harbour dock. Clear all four, then lose the heat at the safehouse.',
    reward: 1500,
  },
];

export function createMissions(G) {
  // Beacon: a glowing column + ring + floating diamond at the target.
  const beacon = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 40, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  col.position.y = 20;
  beacon.add(col);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.name = 'ring';
  beacon.add(ring);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9),
    new THREE.MeshBasicMaterial({ color: 0xffe14d })
  );
  gem.position.y = 5;
  gem.name = 'gem';
  beacon.add(gem);
  beacon.visible = false;
  G.scene.add(beacon);
  G.beacon = beacon;

  G.missions = {
    index: 0, // 0..2 active mission, 3 = story complete / free roam
    stage: 'steal',
    timer: 0,
    target: null,
    rivalsToKill: 0,
    done: [false, false, false],
    storyComplete: false,

    start(G2, i) {
      const def = MISSION_DEFS[i];
      G2.missions.index = i;
      if (i === 0) {
        G2.missions.stage = 'steal';
        G2.missions.target = null;
        beacon.visible = false;
        G2.setObjective(def.id + ' — ' + def.name, def.brief + ' Reward ' + moneyStr(def.reward) + '.');
      } else if (i === 1) {
        G2.missions.stage = 'deliver';
        G2.missions.timer = 75;
        G2.missions.target = G2.landmarks.beach.clone();
        G2.addWanted(2, 'the drop is hot');
        beacon.visible = true;
        beacon.position.copy(G2.missions.target);
        G2.setObjective(def.id + ' — ' + def.name, def.brief + ' Reward ' + moneyStr(def.reward) + '.');
        G2.feed('M2 started: 75 seconds to the beach!');
      } else if (i === 2) {
        G2.missions.stage = 'fight';
        G2.missions.target = G2.landmarks.dock.clone();
        beacon.visible = true;
        beacon.position.copy(G2.missions.target);
        spawnRivals(G2);
        G2.setObjective(def.id + ' — ' + def.name, def.brief + ' Reward ' + moneyStr(def.reward) + '.');
        G2.feed('M3 started: four rivals on the dock. Watch your back.');
      }
      G2.hudDirty = true;
      G2.audio.jingle();
    },

    complete(G2) {
      const def = MISSION_DEFS[G2.missions.index];
      G2.money += def.reward;
      G2.missions.done[G2.missions.index] = true;
      G2.audio.jingle();
      G2.feed(def.id + ' complete! +' + moneyStr(def.reward) + '.');
      G2.saveGame();
      const next = G2.missions.index + 1;
      if (next < MISSION_DEFS.length) {
        G2.missions.start(G2, next);
      } else {
        G2.missions.storyComplete = true;
        G2.missions.index = 3;
        G2.missions.stage = 'roam';
        G2.missions.target = null;
        beacon.visible = false;
        G2.setObjective('Solmar City — Free Roam', 'Story complete! The city is yours. Earn street cash, dodge the patrols, and enjoy the sun.');
        G2.showStoryComplete();
      }
      G2.hudDirty = true;
    },

    onStealCar(G2) {
      if (G2.missions.index === 0 && G2.missions.stage === 'steal') {
        G2.missions.stage = 'deliver';
        G2.missions.target = G2.landmarks.garage.clone();
        G2.beacon.visible = true;
        G2.beacon.position.copy(G2.missions.target);
        G2.setObjective('M1 — First Wheels', 'Car stolen! Now drive it to Lena\'s garage (follow the beacon). Reward $500.');
      }
    },

    onRivalDown(G2) {
      if (G2.missions.index !== 2) return;
      const left = G2.rivals.filter((r) => r.alive).length;
      if (left === 0 && G2.missions.stage === 'fight') {
        G2.missions.stage = 'escape';
        G2.missions.target = G2.landmarks.safehouse.clone();
        G2.beacon.visible = true;
        G2.beacon.position.copy(G2.missions.target);
        G2.setObjective('M3 — Harbor Heat', 'Dock is clear! Now get to the safehouse before the patrols close in.');
        G2.feed('All rivals down — run for the safehouse!');
      }
    },

    update(G2, dt) {
      const m = G2.missions;
      if (G2.state !== 'playing' || m.storyComplete) return;
      // Beacon pulse.
      if (G2.beacon.visible) {
        const gem = G2.beacon.getObjectByName('gem');
        if (gem) { gem.rotation.y += dt * 2; gem.position.y = 5 + Math.sin(G2.time * 2.5) * 0.6; }
        const ring = G2.beacon.getObjectByName('ring');
        if (ring) { const s = 1 + Math.sin(G2.time * 3) * 0.12; ring.scale.set(s, s, 1); }
      }
      if (m.index === 0 && m.stage === 'deliver' && m.target) {
        if (G2.player.car && dist2D(G2.player.pos.x, G2.player.pos.z, m.target.x, m.target.z) < 9) {
          m.complete(G2);
        }
      } else if (m.index === 1 && m.stage === 'deliver') {
        m.timer -= dt;
        if (m.timer <= 0) {
          G2.feed('Too slow — the drop window closed. Try again.');
          m.start(G2, 1); // restart the timed mission
        } else if (m.target && dist2D(G2.player.pos.x, G2.player.pos.z, m.target.x, m.target.z) < 8) {
          m.complete(G2);
        }
      } else if (m.index === 2 && m.stage === 'escape' && m.target) {
        if (dist2D(G2.player.pos.x, G2.player.pos.z, m.target.x, m.target.z) < 8) {
          m.complete(G2);
        }
      }
    },
  };
  return G.missions;
}

function spawnRivals(G) {
  G.rivals = [];
  const spots = [
    [118, 160], [136, 172], [122, 180], [134, 158],
  ];
  for (const [x, z] of spots) {
    const mesh = makePedMesh(0x8a1a1a, 0xd9a066);
    // Red bandana: a flat red box on the head.
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42),
      new THREE.MeshLambertMaterial({ color: 0xd23c2e }));
    band.position.y = 1.86; mesh.add(band);
    mesh.position.set(x, 0, z);
    G.scene.add(mesh);
    // Floating HP bar above the head.
    const bar = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8 }));
    bar.add(bg);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    fill.name = 'fill';
    fill.position.z = 0.01;
    bar.add(fill);
    bar.position.set(x, 2.5, z);
    G.scene.add(bar);
    G.rivals.push({
      mesh, pos: mesh.position, hp: 100, maxHp: 100, alive: true,
      hpBar: bar, shootCooldown: 1 + G.rng() * 1.5, flash: 0, phase: G.rng() * 6,
    });
  }
}

export function updateRivals(G, dt) {
  const p = G.player;
  for (const r of G.rivals) {
    if (!r.alive) continue;
    const dx = p.pos.x - r.pos.x, dz = p.pos.z - r.pos.z;
    const d = Math.hypot(dx, dz);
    // Rivals hold the dock but shoot when the player gets close.
    if (d < 34) {
      r.mesh.rotation.y = Math.atan2(dx, dz);
      r.shootCooldown -= dt;
      if (r.shootCooldown <= 0 && d < 30) {
        r.shootCooldown = 1.4 + G.rng() * 0.8;
        // Rival fire: a tracer from the rival toward the player, with a
        // hit chance that falls off with distance.
        const from = r.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const to = p.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
        const hitChance = d < 12 ? 0.45 : d < 20 ? 0.3 : 0.18;
        if (G.rng() < hitChance) {
          G.hurtPlayer(7, 'shot by a rival');
        }
        // Reuse the combat tracer pool for the enemy shot.
        const t = G.combat.tracers.find((x) => x.life <= 0) || G.combat.tracers[0];
        t.line.geometry.setFromPoints([from, to]);
        t.line.material.color.setHex(0xff6666);
        t.line.visible = true;
        t.life = 0.09;
        G.audio.shot();
      }
      // Strafe a little so they are not statues.
      r.phase += dt;
      const sx = Math.sin(r.phase * 0.9) * 1.2;
      r.pos.x += Math.sin(Math.atan2(dx, dz) + Math.PI / 2) * sx * dt * 0.3;
    }
  }
}
