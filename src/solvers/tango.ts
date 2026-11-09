// Tango: fill an N x N grid (N even) with two symbols. Each row and column has
// N/2 of each; never three of the same in a row; '=' links need equal symbols,
// 'x' links need opposite ones.
//
// Solver: incremental constraint propagation over typed arrays (no allocation
// after setup), failed-literal probing, then DFS branching on the cell whose
// probes implied the most (lookahead).
//  - every assigned cell is queued once (the trail doubles as the queue)
//  - links: an assigned end forces the other end
//  - triples: two equal symbols in any window of three force the third
//    (covers both "pair" XX_ -> XXO and "sandwich" X_X -> XOX)
//  - counts: once a line holds N/2 of a symbol, its remaining cells take the other
//  - probing: if placing v in a cell propagates to a contradiction, the cell is 1-v
//    (this subsumes chain/edge-pair/count-with-pairs tricks humans use)
// All deductions are sound, and a full assignment that survives propagation is a
// valid grid, so the search is exact (also used to count solutions).

export interface TangoPuzzle {
  size: number;
  /** pre-filled cells: index -> 0 | 1 */
  given: Record<number, number>;
  /** [cellA, cellB, '=' | 'x'] */
  edges: [number, number, '=' | 'x'][];
}

export interface TangoOptions {
  /** If set, branch values are picked at random (used to generate grids). */
  random?: () => number;
}

interface Engine {
  g: Int8Array;
  /** Run the search; onSolution returns true to stop. Returns true if stopped. */
  search(onSolution: () => boolean): boolean;
}

function makeEngine(p: TangoPuzzle, random?: () => number): Engine | null {
  const N = p.size;
  if (!Number.isInteger(N) || N < 0 || N % 2 !== 0) return null;
  const n = N * N;
  const half = N / 2;

  const g = new Int8Array(n).fill(-1);
  const rowOf = new Int32Array(n);
  const colOf = new Int32Array(n);
  for (let c = 0; c < n; c++) { rowOf[c] = (c / N) | 0; colOf[c] = c % N; }
  // counts[line * 2 + v]; rows are lines 0..N-1, columns N..2N-1
  const rowCnt = new Int32Array(2 * N);
  const colCnt = new Int32Array(2 * N);

  // Links in CSR form. linkX = 0 for '=', 1 for 'x' (required value = v ^ linkX).
  const start = new Int32Array(n + 1);
  for (const [a, b, t] of p.edges) {
    if (!(a >= 0 && a < n && b >= 0 && b < n) || !Number.isInteger(a) || !Number.isInteger(b)) return null;
    if (a === b) { if (t !== '=') return null; continue; }
    start[a + 1]++; start[b + 1]++;
  }
  for (let c = 0; c < n; c++) start[c + 1] += start[c];
  const linkTo = new Int32Array(start[n]);
  const linkX = new Uint8Array(start[n]);
  {
    const fill = start.slice(0, n);
    for (const [a, b, t] of p.edges) {
      if (a === b) continue;
      const x = t === '=' ? 0 : 1;
      linkTo[fill[a]] = b; linkX[fill[a]++] = x;
      linkTo[fill[b]] = a; linkX[fill[b]++] = x;
    }
  }

  const trail = new Int32Array(n);
  let tl = 0; // trail length
  let qh = 0; // queue head: trail[qh..tl) still to propagate

  /** Set c = v (or check it). False on clash or line overflow. */
  const assign = (c: number, v: number): boolean => {
    const cur = g[c];
    if (cur >= 0) return cur === v;
    g[c] = v;
    trail[tl++] = c;
    const r = ++rowCnt[rowOf[c] * 2 + v];
    const k = ++colCnt[colOf[c] * 2 + v];
    return r <= half && k <= half;
  };

  const undo = (mark: number) => {
    while (tl > mark) {
      const c = trail[--tl];
      const v = g[c];
      rowCnt[rowOf[c] * 2 + v]--;
      colCnt[colOf[c] * 2 + v]--;
      g[c] = -1;
    }
    qh = mark;
  };

  /** x, y and an assigned v-cell form a window of three. */
  const window3 = (x: number, y: number, v: number): boolean => {
    const gx = g[x], gy = g[y];
    if (gx === v) {
      if (gy === v) return false;
      if (gy < 0) return assign(y, v ^ 1);
    } else if (gy === v && gx < 0) {
      return assign(x, v ^ 1);
    }
    return true;
  };

  const propagate = (): boolean => {
    while (qh < tl) {
      const c = trail[qh++];
      const v = g[c];
      const w = v ^ 1;
      for (let k = start[c], e = start[c + 1]; k < e; k++) {
        if (!assign(linkTo[k], v ^ linkX[k])) return false;
      }
      const r = rowOf[c], j = colOf[c];
      // row windows
      if (j >= 2 && !window3(c - 1, c - 2, v)) return false;
      if (j >= 1 && j + 1 < N && !window3(c - 1, c + 1, v)) return false;
      if (j + 2 < N && !window3(c + 1, c + 2, v)) return false;
      // column windows
      if (r >= 2 && !window3(c - N, c - 2 * N, v)) return false;
      if (r >= 1 && r + 1 < N && !window3(c - N, c + N, v)) return false;
      if (r + 2 < N && !window3(c + N, c + 2 * N, v)) return false;
      // line completion
      if (rowCnt[r * 2 + v] === half && rowCnt[r * 2 + w] < half) {
        for (let x = r * N, e = x + N; x < e; x++) if (g[x] < 0 && !assign(x, w)) return false;
      }
      if (colCnt[j * 2 + v] === half && colCnt[j * 2 + w] < half) {
        for (let x = j; x < n; x += N) if (g[x] < 0 && !assign(x, w)) return false;
      }
    }
    return true;
  };

  // Probe scores: how many cells each value of a cell implies (lookahead branching).
  const score = new Float64Array(n);

  /** Failed-literal probing to a fixpoint. False on contradiction. */
  const probe = (): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let c = 0; c < n; c++) {
        if (g[c] >= 0) continue;
        const mark = tl;
        let ok = assign(c, 0) && propagate();
        const k0 = tl - mark;
        undo(mark);
        if (!ok) {
          if (!(assign(c, 1) && propagate())) return false;
          changed = true;
          continue;
        }
        ok = assign(c, 1) && propagate();
        const k1 = tl - mark;
        undo(mark);
        if (!ok) {
          if (!(assign(c, 0) && propagate())) return false;
          changed = true;
          continue;
        }
        score[c] = k0 * k1 + k0 + k1;
      }
    }
    return true;
  };

  /** After probe(): the empty cell whose two values imply the most, or -1. */
  const pickLookahead = (): number => {
    let best = -1, bs = -1;
    for (let c = 0; c < n; c++) if (g[c] < 0 && score[c] > bs) { bs = score[c]; best = c; }
    return best;
  };

  /** Empty cell in the line (row or column) with the fewest empties, or -1. */
  const pick = (): number => {
    let best = -1, bestEmpty = N + 1;
    for (let i = 0; i < N; i++) {
      const er = N - rowCnt[2 * i] - rowCnt[2 * i + 1];
      if (er > 0 && er < bestEmpty) { bestEmpty = er; best = i; }
      const ec = N - colCnt[2 * i] - colCnt[2 * i + 1];
      if (ec > 0 && ec < bestEmpty) { bestEmpty = ec; best = N + i; }
      if (bestEmpty === 1) break;
    }
    if (best < 0) return -1;
    if (best < N) {
      for (let x = best * N, e = x + N; x < e; x++) if (g[x] < 0) return x;
    } else {
      for (let x = best - N; x < n; x += N) if (g[x] < 0) return x;
    }
    return -1;
  };

  let onSol: () => boolean = () => true;
  const node = (): boolean => {
    const mark = tl;
    if (!probe()) { undo(mark); return false; }
    // Random fills (grid generation) branch line by line so generated grids do
    // not depend on solver tuning; solving uses lookahead.
    const c = random ? pick() : pickLookahead();
    if (c < 0) {
      if (onSol()) return true;
      undo(mark);
      return false;
    }
    const first = random ? (random() < 0.5 ? 0 : 1) : 0;
    for (let i = 0; i < 2; i++) {
      const m = tl;
      if (assign(c, first ^ i) && propagate() && node()) return true;
      undo(m);
    }
    undo(mark);
    return false;
  };

  // Givens (validated) + initial propagation.
  for (const key in p.given) {
    const c = +key, v = p.given[key];
    if (!Number.isInteger(c) || c < 0 || c >= n || (v !== 0 && v !== 1)) return null;
    if (!assign(c, v)) return null;
  }
  if (!propagate()) return null;

  return {
    g,
    search(cb) { onSol = cb; return node(); },
  };
}

export function solveTango(p: TangoPuzzle, opts: TangoOptions = {}): number[] | null {
  const e = makeEngine(p, opts.random);
  if (!e || !e.search(() => true)) return null;
  return Array.from(e.g);
}

/** Number of solutions, stopping once `limit` is reached (default 2: "is it unique?"). */
export function countTangoSolutions(p: TangoPuzzle, limit = 2): number {
  const e = makeEngine(p);
  if (!e) return 0;
  let count = 0;
  e.search(() => ++count >= limit);
  return count;
}

export function checkTango(p: TangoPuzzle, s: number[]): boolean {
  const N = p.size;
  if (s.length !== N * N || s.some((v) => v !== 0 && v !== 1)) return false;
  for (const [c, v] of Object.entries(p.given)) if (s[+c] !== v) return false;
  for (const [a, b, t] of p.edges) if ((s[a] === s[b]) !== (t === '=')) return false;
  for (let i = 0; i < N; i++) {
    for (const line of [
      Array.from({ length: N }, (_, j) => s[i * N + j]),
      Array.from({ length: N }, (_, j) => s[j * N + i]),
    ]) {
      if (line.filter((v) => v === 1).length !== N / 2) return false;
      for (let j = 2; j < N; j++) if (line[j] === line[j - 1] && line[j] === line[j - 2]) return false;
    }
  }
  return true;
}

/**
 * Random puzzle with a known solution, for tests and benchmarks.
 * mode 'unique': reveal random clues (givens and edge marks) until the solution is unique.
 * mode 'minimal': as 'unique', then drop every clue that is not needed (LinkedIn-like).
 * mode 'sparse': reveal `density` of the clues; may have several solutions.
 */
export function generateTango(
  size: number,
  random: () => number,
  mode: 'unique' | 'minimal' | 'sparse' = 'unique',
  density = 0.1,
): { puzzle: TangoPuzzle; solution: number[] } {
  const solution = solveTango({ size, given: {}, edges: [] }, { random })!;
  const N = size;
  type Clue = [0, number] | [1, number, number];
  const clues: Clue[] = [];
  for (let c = 0; c < N * N; c++) {
    clues.push([0, c]);
    if (c % N < N - 1) clues.push([1, c, c + 1]);
    if (c + N < N * N) clues.push([1, c, c + N]);
  }
  for (let i = clues.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [clues[i], clues[j]] = [clues[j], clues[i]];
  }
  const build = (cs: Clue[]): TangoPuzzle => {
    const given: Record<number, number> = {};
    const edges: [number, number, '=' | 'x'][] = [];
    for (const k of cs) {
      if (k[0] === 0) given[k[1]] = solution[k[1]];
      else edges.push([k[1], k[2], solution[k[1]] === solution[k[2]] ? '=' : 'x']);
    }
    return { size, given, edges };
  };
  if (mode === 'sparse') {
    return { puzzle: build(clues.slice(0, Math.round(clues.length * density))), solution };
  }
  // Reveal until unique: grow in chunks, then binary-search the shortest unique prefix.
  let lo = 0, hi = Math.min(clues.length, 4);
  while (countTangoSolutions(build(clues.slice(0, hi))) > 1) { lo = hi; hi = Math.min(clues.length, hi * 2); }
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (countTangoSolutions(build(clues.slice(0, mid))) > 1) lo = mid + 1; else hi = mid;
  }
  let used = clues.slice(0, hi);
  if (mode === 'minimal') {
    for (let i = used.length - 1; i >= 0; i--) {
      const without = used.slice(0, i).concat(used.slice(i + 1));
      if (countTangoSolutions(build(without)) === 1) used = without;
    }
  }
  return { puzzle: build(used), solution };
}
