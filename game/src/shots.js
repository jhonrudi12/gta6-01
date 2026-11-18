// shots.js — deterministic screenshot presets, driven by ?shot= and ?seed=.
// Each preset stages the world (position, wanted level, mission, police)
// so the four screenshots show the chase, the street on foot, the harbour
// mission and the title screen. Normal play without ?shot= is untouched.
import * as THREE from 'three';
import { hashSeed } from './util.js';

export function parseShotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot') || '';
  const seedText = q.get('seed') || 'solmar-1';
  return { shot, seed: hashSeed(seedText) };
}

export function applyShotPreset(G, shot) {
  if (!shot) return false;
  if (shot === 'start') {
    // Title screen over a slow orbit of the city; the menu is the shot.
    G.state = 'menu';
    G.player.pos.set(0, 0, 60);
    G.player.camYaw = Math.PI * 0.9;
    G.player.camPitch = 0.5;
    G.autoOrbit = true;
    return true;
  }
  // Every in-game preset starts the game for real.
  G.startGame(false);
  if (shot === 'chase') {
    // In a stolen car at a busy crossroads, wanted 3, three patrol cars on
    // the tail, M2 objective live on the HUD.
    const p = G.player;
    const car = G.cars[2];
    car.kind = 'player';
    car.speed = 14; car.heading = Math.PI / 2;
    car.mesh.position.set(-40, 0, 0);
    car.mesh.rotation.y = car.heading;
    p.car = car; p.onFoot = false;
    p.pos.set(-40, 0, 0);
    p.camYaw = Math.PI / 2; p.camPitch = 0.42;
    G.missions.start(G, 1);
    G.missions.timer = 62;
    // Wanted 3 AFTER the mission starts: M2's scripted +2 would otherwise
    // stack on top of it and show five stars.
    G.wanted = 3;
    // Patrol cars converging ahead of the player (visible in the frame),
    // plus one on the tail behind.
    const pc1 = G.spawnPoliceCarAt(-26, 3.5);
    pc1.speed = 16;
    const pc2 = G.spawnPoliceCarAt(-16, -3.5);
    pc2.speed = 16;
    const pc3 = G.spawnPoliceCarAt(-54, 1);
    pc3.speed = 18;
    // A few traffic cars ahead for the chase to weave through.
    G.cars[0].along = 40; G.cars[1].along = -30;
    G.feed('Patrol cars are on your tail — lose them!');
    return true;
  }
  if (shot === 'foot') {
    // On foot at the central crossroads, traffic and pedestrians all around.
    const p = G.player;
    p.pos.set(2, 0, 2);
    p.camYaw = Math.PI * 0.78; p.camPitch = 0.3;
    p.weapon = 'pistol';
    // Bunch the traffic and peds around the intersection.
    G.cars.forEach((c, i) => {
      c.along = (i % 2 === 0 ? -1 : 1) * (8 + i * 7);
      c.laneCoord = [-40, 0, 40][i % 3];
      c.vertical = i % 2 === 0;
    });
    G.peds.forEach((pd, i) => {
      pd.street = [-40, 0, 40][i % 3];
      pd.along = (i - 12) * 4;
      pd.side = i % 2 === 0 ? -8.6 : 8.6;
    });
    G.feed('Downtown Solmar — the city is yours to explore.');
    return true;
  }
  if (shot === 'mission') {
    // M3 at the harbour dock: rivals in sight, beacon over the dock.
    const p = G.player;
    p.pos.set(118, 0, 138);
    // Face the dock: direction to (128, 168) is atan2(10, 30) ≈ 0.32.
    p.camYaw = 0.32; p.camPitch = 0.3;
    p.weapon = 'pistol';
    G.missions.start(G, 2);
    G.wanted = 2;
    return true;
  }
  return false;
}
