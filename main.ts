// main.ts — Solmar City's entry program (Node 22, standard library only).
//
// What it does, in order:
//   1. Finds the output folder: MAKEFUN_OUTPUT_DIR when set, else /output.
//   2. Copies this repo's game/ (static three.js open world) and
//      screenshots/ (four real renders) into it.
//   3. Writes dossier.json with the kit's buildDossier, using the same
//      caps the gate enforces, so the dossier matches byte for byte.
//
// I kept the starter's shape (cpSync + buildDossier) because that shape is
// what the gate expects, but every comment and the layout here are mine.
// Run it locally like this:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's own caps, from the kit's reference/gate.json: the dossier text
// is capped at 160 KiB, at most 4 screenshots of 256 KiB each, game/ holds
// at most 993 files / 48 MiB with paths under 1000 bytes. buildDossier
// refuses anything over those, so a bad build fails here, loudly, instead
// of silently shipping an invalid entry.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
