// Stress-test the Zip solver on random puzzles (deterministic for a given seed).
// Usage: node scripts/bench-zip.ts [size=8] [count=200] [numbers=8] [walls=6] [seed=1] [--solver path.ts]
//   size: N for an NxN grid, or RxC (e.g. 7x9) for a non-square grid
//   --solver: benchmark another module exporting solveZip (for A/B comparisons)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkZip, type ZipPuzzle, type WallDir } from '../src/solvers/zip.ts';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random Hamiltonian path on an R x C grid via "backbite" moves from a serpentine. */
export function randomPath(R: number, C: number, rand: () => number): number[] {
  const path: number[] = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) path.push(r * C + (r % 2 ? C - 1 - c : c));
  if (R * C < 2) return path;
  const nb = (x: number) => {
    const r = Math.floor(x / C), c = x % C, o: number[] = [];
    if (r > 0) o.push(x - C);
    if (r < R - 1) o.push(x + C);
    if (c > 0) o.push(x - 1);
    if (c < C - 1) o.push(x + 1);
    return o;
  };
  const iters = R * C * Math.max(R, C) * 4;
  for (let it = 0; it < iters; it++) {
    if (rand() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const opts = nb(end).filter((x) => x !== path[path.length - 2]);
    if (!opts.length) continue;
    const x = opts[Math.floor(rand() * opts.length)];
    const i = path.indexOf(x);
    const tail = path.splice(i + 1).reverse(); // reverse the segment after x
    path.push(...tail);
  }
  return path;
}

/** Random solvable puzzle: k numbers (incl. start and end) and up to w walls off the hidden path. */
export function randomPuzzle(R: number, C: number, k: number, w: number, rand: () => number): ZipPuzzle {
  return randomZip(R, C, k, w, rand).puzzle;
}

/** Like randomPuzzle, also returning the hidden solution the puzzle was built from. */
export function randomZip(R: number, C: number, k: number, w: number, rand: () => number) {
  const path = randomPath(R, C, rand);
  const n = R * C;
  const pos = new Int32Array(n);
  path.forEach((c, i) => (pos[c] = i));
  const picks = new Set([0, n - 1]);
  while (picks.size < Math.min(k, n)) picks.add(Math.floor(rand() * n));
  const nums: Record<number, number> = {};
  [...picks].sort((a, b) => a - b).forEach((i, s) => (nums[path[i]] = s));
  const wl: [number, WallDir][] = [];
  for (let t = 0; t < w * 20 && wl.length < w; t++) {
    const c = Math.floor(rand() * n);
    const right = rand() < 0.5;
    const o = right ? c + 1 : c + C;
    if (right ? c % C === C - 1 : o >= n) continue;
    if (Math.abs(pos[c] - pos[o]) === 1) continue; // keep the hidden solution valid
    wl.push([c, right ? 'RIGHT' : 'DOWN']);
  }
  const puzzle: ZipPuzzle = { rows: R, cols: C, numbers: nums, walls: wl };
  return { puzzle, solution: path };
}

async function main() {
  const argv = process.argv.slice(2);
  let solverPath = '../src/solvers/zip.ts';
  const si = argv.indexOf('--solver');
  if (si >= 0) {
    solverPath = pathToFileURL(resolve(argv[si + 1])).href;
    argv.splice(si, 2);
  }
  const { solveZip } = await import(solverPath);
  const [sizeArg = '8', countArg = '200', numArg = '8', wallArg = '6', seedArg = '1'] = argv;
  const [R, C] = sizeArg.includes('x') ? sizeArg.split('x').map(Number) : [+sizeArg, +sizeArg];
  const count = +countArg, numbers = +numArg, walls = +wallArg, seed = +seedArg;

  const rand = mulberry32(seed);
  const times: number[] = [];
  let fails = 0, worst = -1, worstT = -1;
  for (let i = 0; i < count; i++) {
    const p = randomPuzzle(R, C, numbers, walls, rand);
    const t = performance.now();
    const sol = solveZip(p);
    const dt = performance.now() - t;
    times.push(dt);
    if (dt > worstT) { worstT = dt; worst = i; }
    if (!sol || !checkZip(p, sol)) fails++;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))].toFixed(2);
  const mean = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
  console.log(`${R}x${C}, ${numbers} numbers, ${walls} walls, ${count} puzzles, seed ${seed}: ` +
    `median ${q(0.5)} ms, mean ${mean} ms, p95 ${q(0.95)} ms, p99 ${q(0.99)} ms, max ${q(1)} ms ` +
    `(#${worst}), failures ${fails}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
