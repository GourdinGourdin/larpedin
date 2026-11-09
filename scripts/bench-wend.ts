// Benchmark the Wend solver on seeded random puzzles (bundled dictionary).
// Usage: node scripts/bench-wend.ts [count=200] [seed=1] [sizes=5,6,7] [maxRank=2]
//   Each puzzle: k random snakes (5x5: 4 words, 6x6: 5, 7x7: 6, ...) with lengths
//   3..9 filling ~80-90% of the grid, the rest holes; words drawn from the
//   dictionary with commonness rank <= maxRank (0..8; 2 = SCOWL size 35).
// Reports solve time (median / p95 / max), candidate paths, whether the planted
// answer was returned, and failures (no valid answer).
import { wendDict } from '../src/data/wend-dict.ts';
import { generateWend, solveWendDetailed, checkWend, wendCandidates } from '../src/solvers/wend.ts';

const args = process.argv.slice(2);
const count = Number(args[0] ?? 200);
const seed = Number(args[1] ?? 1);
const sizes = (args[2] ?? '5,6,7').split(',').map(Number);
const maxRank = Number(args[3] ?? 2);

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** k word lengths in 3..9 whose sum is 80-90% of n cells. */
export function randomLengths(n: number, k: number, rng: () => number): number[] {
  for (;;) {
    const ls = Array.from({ length: k }, () => 3 + Math.floor(rng() * 7));
    const s = ls.reduce((a, b) => a + b, 0);
    if (s >= 0.8 * n && s <= 0.9 * n) return ls.sort((a, b) => a - b);
  }
}

const answerKey = (ps: number[][]) => ps.map((x) => x.join()).sort().join('|');

let t = performance.now();
const dict = wendDict();
console.log(`dictionary: ${dict.words.length} words, decoded in ${(performance.now() - t).toFixed(1)} ms`);
console.log(`count ${count}, seed ${seed}, word rank <= ${maxRank}`);
console.log('size  words  cands  median ms    p95 ms    max ms  planted  fails');
for (const size of sizes) {
  const rng = mulberry32(seed * 1000003 + size * 101);
  const k = size - 1;
  const puzzles = [];
  while (puzzles.length < count) {
    const g = generateWend(size, size, randomLengths(size * size, k, rng), rng, dict, maxRank);
    if (g) puzzles.push(g);
  }
  for (let i = 0; i < Math.min(5, count); i++) solveWendDetailed(puzzles[i].puzzle, dict); // warm-up
  const times: number[] = [];
  let fails = 0, planted = 0, cands = 0;
  for (const { puzzle, solution } of puzzles) {
    cands += wendCandidates(puzzle, dict).length;
    const t0 = performance.now();
    const s = solveWendDetailed(puzzle, dict);
    times.push(performance.now() - t0);
    if (!s || !checkWend(puzzle, s.paths, dict)) fails++;
    else if (answerKey(s.paths) === answerKey(solution)) planted++;
  }
  times.sort((a, b) => a - b);
  const q = (f: number) => times[Math.min(times.length - 1, Math.floor(f * times.length))];
  const fmt = (x: number) => x.toFixed(2).padStart(10);
  console.log(`${`${size}x${size}`.padStart(4)}${String(k).padStart(7)}${(cands / count).toFixed(0).padStart(7)}` +
    `${fmt(q(0.5))}${fmt(q(0.95))}${fmt(q(1))}${`${((100 * planted) / count).toFixed(0)}%`.padStart(9)}${String(fails).padStart(7)}`);
}
