// Benchmark the Queens solver on seeded random puzzles.
// Usage: node scripts/bench-queens.ts [--sizes 7-12] [--count 200] [--seed 1]
//                                     [--unique | --free] [--solver path/to/queens.ts]
// Default: regions grown around a planted solution (may have several solutions).
// --unique: repaired until exactly one solution exists (like LinkedIn's).
// --free: regions grown from random cells; often unsolvable (worst case for search).
// --solver benchmarks another solveQueens implementation (e.g. an old copy)
// on the same puzzles; puzzles are always generated with this repo's solver.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkQueens, solveAllQueens, solveQueens, type QueensPuzzle } from '../src/solvers/queens.ts';

/** mulberry32: small seeded PRNG returning floats in [0, 1). */
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

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random column per row: distinct columns, consecutive rows >= 2 columns apart. */
export function randomQueens(N: number, rand: () => number): number[] {
  const cols: number[] = [];
  const used = new Uint8Array(N);
  const place = (r: number): boolean => {
    if (r === N) return true;
    for (const c of shuffle([...Array(N).keys()], rand)) {
      if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      used[c] = 1; cols[r] = c;
      if (place(r + 1)) return true;
      used[c] = 0;
    }
    return false;
  };
  if (!place(0)) throw new Error(`no ${N}-queens placement`);
  return cols;
}

/** Grow region i from seeds[i] by giving random frontier cells to a neighbouring region. */
export function growRegions(N: number, seeds: number[], rand: () => number): number[] {
  const regions = new Array<number>(N * N).fill(-1);
  const frontier: [number, number][] = [];
  const grow = (cell: number, k: number) => {
    regions[cell] = k;
    const r = Math.floor(cell / N), c = cell % N;
    if (r > 0) frontier.push([cell - N, k]);
    if (r < N - 1) frontier.push([cell + N, k]);
    if (c > 0) frontier.push([cell - 1, k]);
    if (c < N - 1) frontier.push([cell + 1, k]);
  };
  seeds.forEach(grow);
  while (frontier.length) {
    const i = Math.floor(rand() * frontier.length);
    const [cell, k] = frontier[i];
    frontier[i] = frontier[frontier.length - 1];
    frontier.pop();
    if (regions[cell] < 0) grow(cell, k);
  }
  return regions;
}

/**
 * Random valid puzzle: place a solution, then grow one region from each
 * queen. The planted solution is always valid; others may exist.
 */
export function randomPuzzle(N: number, rand: () => number): { puzzle: QueensPuzzle; solution: number[] } {
  const solution = randomQueens(N, rand);
  const regions = growRegions(N, solution.map((c, r) => r * N + c), rand);
  return { puzzle: { size: N, regions }, solution };
}

/** Regions grown from N random seed cells: often has no solution at all. */
export function randomFreePuzzle(N: number, rand: () => number): QueensPuzzle {
  const seeds = shuffle([...Array(N * N).keys()], rand).slice(0, N);
  return { size: N, regions: growRegions(N, seeds, rand) };
}

/** Is region k one 4-connected piece? */
function connected(regions: number[], N: number, k: number): boolean {
  const cells = regions.flatMap((x, i) => (x === k ? [i] : []));
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / N), c = i % N;
    for (const j of [r > 0 ? i - N : -1, r < N - 1 ? i + N : -1, c > 0 ? i - 1 : -1, c < N - 1 ? i + 1 : -1]) {
      if (j >= 0 && regions[j] === k && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

/**
 * Random puzzle with exactly one solution (like LinkedIn's): start from
 * randomPuzzle and, while another solution exists, hand one of its queen
 * cells to a neighbouring region (keeping every region connected and the
 * planted solution valid).
 */
export function randomUniquePuzzle(N: number, rand: () => number, maxTries = 100) {
  for (let t = 0; t < maxTries; t++) {
    const { puzzle, solution } = randomPuzzle(N, rand);
    const { regions } = puzzle;
    for (let step = 0; step < 50 * N; step++) {
      const sols = solveAllQueens(puzzle, 2);
      if (sols.length === 1) return { puzzle, solution: sols[0] };
      const alt = sols.find((s) => s.some((c, r) => c !== solution[r]))!;
      const isQueen = new Set(solution.map((c, r) => r * N + c));
      // Hand a cell to a neighbouring region if its own region stays connected.
      const move = (cell: number) => {
        const r = Math.floor(cell / N), c = cell % N, from = regions[cell];
        if (isQueen.has(cell)) return false;
        const nbs = shuffle([r > 0 ? cell - N : -1, r < N - 1 ? cell + N : -1,
          c > 0 ? cell - 1 : -1, c < N - 1 ? cell + 1 : -1].filter((j) => j >= 0), rand);
        for (const j of nbs) {
          if (regions[j] === from) continue;
          regions[cell] = regions[j];
          if (connected(regions, N, from)) return true;
          regions[cell] = from;
        }
        return false;
      };
      const rows = shuffle([...Array(N).keys()].filter((r) => alt[r] !== solution[r]), rand);
      if (!rows.some((r) => move(r * N + alt[r]))) {
        // Stuck: reshape some random region border instead, then retry.
        for (let i = 0; i < N * N && !move(Math.floor(rand() * N * N)); i++);
      }
    }
  }
  throw new Error(`no unique ${N}x${N} puzzle in ${maxTries} tries`);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string, def: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const [lo, hi = lo] = opt('sizes', '7-12').split('-').map(Number);
  const count = Number(opt('count', '200'));
  const seed = Number(opt('seed', '1'));
  const mode = args.includes('--unique') ? 'unique' : args.includes('--free') ? 'free' : 'planted';
  const solverPath = opt('solver', '');
  const solve: (p: QueensPuzzle) => number[] | null = solverPath
    ? (await import(pathToFileURL(resolve(solverPath)).href)).solveQueens
    : solveQueens;

  console.log(`solver: ${solverPath || 'src/solvers/queens.ts'}, ${count} ${mode} puzzles per size, seed ${seed}`);
  console.log('size  median ms   p95 ms    max ms  no-solution  failures');
  for (let N = lo; N <= hi; N++) {
    const rand = rng(seed * 1000 + N);
    const puzzles = Array.from({ length: count }, () =>
      mode === 'unique' ? randomUniquePuzzle(N, rand).puzzle
      : mode === 'free' ? randomFreePuzzle(N, rand)
      : randomPuzzle(N, rand).puzzle);
    solve(puzzles[0]); // warm up the JIT a little
    const times: number[] = [];
    let fails = 0, none = 0;
    for (const p of puzzles) {
      const t = performance.now();
      const sol = solve(p);
      times.push(performance.now() - t);
      if (!sol) none++;
      // Planted and unique puzzles always have a solution; free ones may not.
      if (sol ? !checkQueens(p, sol) : mode !== 'free') fails++;
    }
    times.sort((a, b) => a - b);
    const q = (f: number) => times[Math.min(times.length - 1, Math.floor(f * times.length))];
    const f = (x: number) => x.toFixed(3).padStart(9);
    console.log(`${String(N).padStart(4)} ${f(q(0.5))} ${f(q(0.95))} ${f(q(1))} ${String(none).padStart(12)} ${String(fails).padStart(9)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
