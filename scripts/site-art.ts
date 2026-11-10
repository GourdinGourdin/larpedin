// Writes the website's game illustrations from the same puzzle data as the
// video (video/data.js, built by video/make-data.ts from the fixtures and the
// real solvers): site/assets/games/<game>.svg and site/assets/icon.svg.
//   node scripts/site-art.ts      (or: npm run site:art)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { allBoards, type ArtData } from '../src/art/boards.ts';
import { markSvg } from '../src/page/theme.ts';

const js = readFileSync('video/data.js', 'utf8');
const data = JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1)) as ArtData;
mkdirSync('site/assets/games', { recursive: true });
for (const [game, svg] of Object.entries(allBoards(data))) {
  writeFileSync(`site/assets/games/${game}.svg`, svg);
  console.log(`site/assets/games/${game}.svg ${(svg.length / 1024).toFixed(1)} KB`);
}
writeFileSync('site/assets/icon.svg', markSvg(128, 'LarpedIn'));
