// Builds data.js for the video from the real fixtures and solvers.
import { readFileSync, writeFileSync } from 'node:fs';
import { solveZip, zipNeighbors } from '../src/solvers/zip.ts';
import { solveQueens } from '../src/solvers/queens.ts';
import { solveTango } from '../src/solvers/tango.ts';
import { solvePatches, parseShape } from '../src/solvers/patches.ts';

const day = JSON.parse(readFileSync(new URL('../fixtures/2026-11-09.json', import.meta.url), 'utf8'));

const zip = day.zip;
const zipPath = solveZip(zip)!;

// A plain depth-first search trace on the Zip board (for the "solve" scene):
// records every step forward and every backtrack until it finds the path.
const adj = zipNeighbors(zip);
const n = zip.rows * zip.cols;
const seq = new Int32Array(n).fill(-1);
for (const [c, s] of Object.entries(zip.numbers)) seq[+c] = s as number;
const last = Math.max(...Object.values(zip.numbers) as number[]);
const start = +Object.keys(zip.numbers).find((c) => zip.numbers[c] === 0)!;
const trace: [string, number][] = [];
const vis = new Uint8Array(n);
const connected = (head: number, remaining: number) => {
  const seen = new Uint8Array(n); const st = [head]; seen[head] = 1; let k = 0;
  while (st.length) { const c = st.pop()!; for (const o of adj[c]) if (!vis[o] && !seen[o]) { seen[o] = 1; k++; st.push(o); } }
  return k === remaining;
};
const dfs = (h: number, d: number, next: number): boolean => {
  if (d === n) return seq[h] === last;
  for (const o of adj[h]) {
    if (vis[o] || (seq[o] >= 0 && seq[o] !== next)) continue;
    vis[o] = 1; trace.push(['+', o]);
    if (connected(o, n - d - 1) && dfs(o, d + 1, seq[o] >= 0 ? next + 1 : next)) return true;
    vis[o] = 0; trace.push(['-', o]);
  }
  return false;
};
vis[start] = 1;
dfs(start, 1, 1);

const queensCols = solveQueens(day.queens)!;
const tango = solveTango(day.tango)!;
const pz = {
  rows: day.patches.rows, cols: day.patches.cols,
  clues: day.patches.clues.map(([cell, shape, size]: [number, string, number]) => ({ cell, shape: parseShape(shape), size })),
};
const rects = solvePatches(pz)!;

// Wend: a full 5x5 letter grid (every tile is used, no holes), row-major, and
// the answer words as snakes of orthogonally adjacent cells.
const wend = {
  size: 5,
  letters: [...'QUESO' + 'SNEVL' + 'PEDEP' + 'ULEHA' + 'ZZSCT'],
  words: [
    { word: 'QUEENS', cells: [0, 1, 2, 7, 6, 5] },
    { word: 'SOLVED', cells: [3, 4, 9, 8, 13, 12] },
    { word: 'PUZZLE', cells: [10, 15, 20, 21, 16, 11] },
    { word: 'PATCHES', cells: [14, 19, 24, 23, 18, 17, 22] },
  ],
};
const covered = new Set<number>();
for (const { word, cells } of wend.words) {
  const spelled = cells.map((c) => wend.letters[c]).join('');
  const adjacent = cells.every((c, i) => i === 0 || Math.abs(((c / 5) | 0) - ((cells[i - 1] / 5) | 0)) + Math.abs((c % 5) - (cells[i - 1] % 5)) === 1);
  if (spelled !== word || !adjacent) throw new Error(`bad Wend word ${word}: ${spelled}`);
  cells.forEach((c) => covered.add(c));
}
const letterCells = wend.letters.filter((l) => l).length;
if (covered.size !== letterCells) throw new Error(`Wend words cover ${covered.size}/${letterCells} letters`);

const data = {
  zip: { ...zip, path: zipPath, start, trace },
  queens: { ...day.queens, cols: queensCols },
  tango: { ...day.tango, solution: tango },
  patches: { ...pz, rects },
  wend,
};
writeFileSync(new URL('./data.js', import.meta.url), `window.DATA = ${JSON.stringify(data)};\n`);
console.log(`trace steps: ${trace.length}, path length: ${zipPath.length}`);
