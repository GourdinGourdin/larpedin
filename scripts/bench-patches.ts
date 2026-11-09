// Benchmark the Patches solver on seeded random puzzles.
//
// Usage:
//   node scripts/bench-patches.ts [count=200] [seed=1] [--large=20] [--solver=path/to/patches.ts]
//                                 [--pAny=0.25] [--pSize=0.5] [--sizes=6-12,15]
//
// Each puzzle is a random rectangle partition of the grid with one clue per
// rectangle at a random cell; the clue's shape label is consistent with the
// rectangle (sometimes ANY) and it sometimes carries the area. Same seed =>
// same puzzles, so runs of different solvers are directly comparable.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { PatchesPuzzle, PatchShape, Rect } from '../src/solvers/patches.ts';

/** mulberry32: small, fast, seedable PRNG returning floats in [0, 1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenOptions {
  /** longest rectangle side (default max(3, floor(min(rows, cols) / 2))) */
  maxSide?: number;
  /** largest rectangle area (default max(rows, cols) + 2) */
  maxArea?: number;
  /** probability a clue is labelled ANY (default 0.25) */
  pAny?: number;
  /** probability a clue carries its area (default 0.5) */
  pSize?: number;
}

/** Random puzzle plus the partition it was generated from (one rect per clue). */
export function generatePatches(rows: number, cols: number, rand: () => number, o: GenOptions = {}):
  { puzzle: PatchesPuzzle; rects: Rect[] } {
  const maxSide = o.maxSide ?? Math.max(3, Math.floor(Math.min(rows, cols) / 2));
  const maxArea = o.maxArea ?? Math.max(rows, cols) + 2;
  const pAny = o.pAny ?? 0.25, pSize = o.pSize ?? 0.5;
  const ri = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const used = new Uint8Array(rows * cols);
  const rects: Rect[] = [];
  // Row-major scan: the first free cell is always the top-left corner of the
  // next rectangle, so every partition can be produced.
  for (let cell = 0; cell < rows * cols; cell++) {
    if (used[cell]) continue;
    const t = Math.floor(cell / cols), l = cell % cols;
    let maxW = 0;
    while (l + maxW < cols && !used[t * cols + l + maxW] && maxW < maxSide) maxW++;
    let h = 1, w = 1;
    for (let tries = 0; tries < 4; tries++) {
      w = ri(1, maxW);
      let maxH = 0;
      outer: while (t + maxH < rows && maxH < maxSide) {
        for (let x = l; x < l + w; x++) if (used[(t + maxH) * cols + x]) break outer;
        maxH++;
      }
      h = ri(1, Math.max(1, Math.min(maxH, Math.floor(maxArea / w))));
      if (h * w > 1) break; // 1x1 pieces only when nothing else fits or by bad luck
    }
    for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) used[y * cols + x] = 1;
    rects.push([t, l, h, w]);
  }
  const clues = rects.map(([t, l, h, w]) => {
    const cellAt = (t + ri(0, h - 1)) * cols + l + ri(0, w - 1);
    const exact: PatchShape = h === w ? 'SQUARE' : h > w ? 'VERTICAL' : 'HORIZONTAL';
    const shape: PatchShape = rand() < pAny ? 'ANY' : exact;
    const size = rand() < pSize || shape === 'ANY' && rand() < 0.5 ? h * w : 0;
    return { cell: cellAt, shape, size };
  });
  return { puzzle: { rows, cols, clues }, rects };
}

interface SolverModule {
  solvePatches(p: PatchesPuzzle): Rect[] | null;
  checkPatches(p: PatchesPuzzle, r: Rect[]): boolean;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const pos = args.filter((a) => !a.startsWith('--')).map(Number);
  const [count = 200, seed = 1] = pos;
  const large = Number(flag('large') ?? 20);
  const solverPath = flag('solver');
  const mod: SolverModule = solverPath
    ? await import(pathToFileURL(resolve(solverPath)).href)
    : await import('../src/solvers/patches.ts');

  const gen: GenOptions = {};
  if (flag('pAny')) gen.pAny = Number(flag('pAny'));
  if (flag('pSize')) gen.pSize = Number(flag('pSize'));
  // --sizes=6-12,15 : sizes >= 13 get the --large count
  const sizes = (flag('sizes') ?? '6-12,15').split(',').flatMap((part) => {
    const [a, b = a] = part.split('-').map(Number);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
  const groups = sizes.map((s): [number, number] => [s, s >= 13 ? large : count]).filter(([, n]) => n > 0);

  // Warm up the JIT on throwaway puzzles so the first group is not penalised.
  const warm = rng(seed + 0x9e3779b9);
  for (let i = 0; i < 400; i++) mod.solvePatches(generatePatches(6 + (i % 7), 6 + (i % 7), warm, gen).puzzle);

  console.log(`solver: ${solverPath ?? 'src/solvers/patches.ts'}  seed ${seed}  ` +
    `pAny ${gen.pAny ?? 0.25}  pSize ${gen.pSize ?? 0.5}`);
  console.log('size    n   median ms   p95 ms    max ms   fails');
  for (const [size, n] of groups) {
    const rand = rng(seed * 1000 + size);
    const times: number[] = [];
    let fails = 0;
    for (let i = 0; i < n; i++) {
      const { puzzle } = generatePatches(size, size, rand, gen);
      const t = performance.now();
      const sol = mod.solvePatches(puzzle);
      times.push(performance.now() - t);
      if (!sol || !mod.checkPatches(puzzle, sol)) fails++;
    }
    times.sort((a, b) => a - b);
    const q = (f: number) => times[Math.min(n - 1, Math.floor(f * n))].toFixed(3).padStart(9);
    console.log(`${String(size).padStart(2)}x${String(size).padEnd(2)} ${String(n).padStart(4)} ` +
      `${q(0.5)}  ${q(0.95)} ${q(1)}   ${fails}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
