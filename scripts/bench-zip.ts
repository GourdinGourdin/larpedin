// Stress-test the Zip solver on random puzzles.
// Usage: node scripts/bench-zip.ts [size=8] [count=200] [numbers=8] [walls=6]
import { solveZip, checkZip, type ZipPuzzle, type WallDir } from '../src/solvers/zip.ts';

const [size = 8, count = 200, numbers = 8, walls = 6] = process.argv.slice(2).map(Number);

// Random Hamiltonian path via "backbite" moves starting from a serpentine.
function randomPath(N: number): number[] {
  const path: number[] = [];
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) path.push(r * N + (r % 2 ? N - 1 - c : c));
  const nb = (x: number) => {
    const r = Math.floor(x / N), c = x % N, o: number[] = [];
    if (r > 0) o.push(x - N); if (r < N - 1) o.push(x + N);
    if (c > 0) o.push(x - 1); if (c < N - 1) o.push(x + 1);
    return o;
  };
  for (let it = 0; it < N * N * N * 4; it++) {
    if (Math.random() < 0.5) path.reverse();
    const end = path[path.length - 1];
    const opts = nb(end).filter((x) => x !== path[path.length - 2]);
    const x = opts[Math.floor(Math.random() * opts.length)];
    const i = path.indexOf(x);
    // reverse the segment after x
    const tail = path.splice(i + 1).reverse();
    path.push(...tail);
  }
  return path;
}

function randomPuzzle(N: number, k: number, w: number): ZipPuzzle {
  const path = randomPath(N);
  const pos = new Map(path.map((c, i) => [c, i]));
  const picks = new Set([0, path.length - 1]);
  while (picks.size < Math.min(k, path.length)) picks.add(Math.floor(Math.random() * path.length));
  const nums: Record<number, number> = {};
  [...picks].sort((a, b) => a - b).forEach((i, s) => (nums[path[i]] = s));
  const wl: [number, WallDir][] = [];
  for (let t = 0; t < w * 20 && wl.length < w; t++) {
    const c = Math.floor(Math.random() * N * N);
    const right = Math.random() < 0.5;
    const o = right ? c + 1 : c + N;
    if (right ? c % N === N - 1 : o >= N * N) continue;
    if (Math.abs(pos.get(c)! - pos.get(o)!) === 1) continue; // keep solution valid
    wl.push([c, right ? 'RIGHT' : 'DOWN']);
  }
  return { rows: N, cols: N, numbers: nums, walls: wl };
}

const times: number[] = [];
let fails = 0;
for (let i = 0; i < count; i++) {
  const p = randomPuzzle(size, numbers, walls);
  const t = performance.now();
  const sol = solveZip(p);
  times.push(performance.now() - t);
  if (!sol || !checkZip(p, sol)) fails++;
}
times.sort((a, b) => a - b);
const q = (f: number) => times[Math.min(times.length - 1, Math.floor(f * times.length))].toFixed(2);
console.log(`${size}x${size}, ${numbers} numbers, ${walls} walls, ${count} puzzles: ` +
  `median ${q(0.5)} ms, p95 ${q(0.95)} ms, max ${q(1)} ms, failures ${fails}`);
