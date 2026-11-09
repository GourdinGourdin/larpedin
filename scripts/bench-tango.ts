// Benchmark the Tango solver on seeded random puzzles.
// Usage: node scripts/bench-tango.ts [count=200] [seed=1] [sizes=6,8,10,12] [solver=src/solvers/tango.ts]
//   modes: minimal (LinkedIn-like: unique, every clue needed), unique (random clues until
//   unique), sparse (5% of clues, usually many solutions -> stresses search).
// Puzzles are generated with the current solver module, then timed with `solver`
// (pass another file, e.g. an older copy, to compare on identical puzzles).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateTango, checkTango, type TangoPuzzle } from '../src/solvers/tango.ts';

const args = process.argv.slice(2);
const count = Number(args[0] ?? 200);
const seed = Number(args[1] ?? 1);
const sizes = (args[2] ?? '6,8,10,12').split(',').map(Number);
const solverPath = resolve(args[3] ?? 'src/solvers/tango.ts');
const { solveTango } = (await import(pathToFileURL(solverPath).href)) as {
  solveTango: (p: TangoPuzzle) => number[] | null;
};

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const modes = ['minimal', 'unique', 'sparse'] as const;
console.log(`solver: ${solverPath}`);
console.log(`count ${count}, seed ${seed}`);
console.log('size  mode     clues  median ms    p95 ms    max ms  fails');
for (const size of sizes) {
  for (const mode of modes) {
    // 'minimal' generation is slow on big grids; keep it to fewer puzzles there.
    const k = mode === 'minimal' && size >= 10 ? Math.max(1, Math.round(count / 4)) : count;
    const rng = mulberry32(seed * 1000003 + size * 101 + modes.indexOf(mode));
    const puzzles: TangoPuzzle[] = [];
    for (let i = 0; i < k; i++) puzzles.push(generateTango(size, rng, mode, 0.05).puzzle);
    // warm-up (JIT) on a few puzzles, not timed
    for (let i = 0; i < Math.min(5, k); i++) solveTango(puzzles[i]);
    const times: number[] = [];
    let fails = 0, clues = 0;
    for (const p of puzzles) {
      clues += Object.keys(p.given).length + p.edges.length;
      const t = performance.now();
      const s = solveTango(p);
      times.push(performance.now() - t);
      if (!s || !checkTango(p, s)) fails++;
    }
    times.sort((a, b) => a - b);
    const q = (f: number) => times[Math.min(times.length - 1, Math.floor(f * times.length))];
    const fmt = (x: number) => x.toFixed(3).padStart(10);
    console.log(`${String(size).padStart(4)}  ${mode.padEnd(8)}${(clues / k).toFixed(0).padStart(6)}` +
      `${fmt(q(0.5))}${fmt(q(0.95))}${fmt(q(1))}${String(fails).padStart(7)}`);
  }
}
