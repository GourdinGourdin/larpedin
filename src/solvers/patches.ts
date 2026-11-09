// Patches: split the grid into rectangles. Each rectangle holds exactly one
// clue cell and matches its shape (square, tall, wide or any) and, when the
// clue has a number, its area.
//
// Solver: every candidate rectangle of a clue contains that clue's cell and no
// other clue cell, so the puzzle is an exact cover of the grid cells by
// candidates (clue cells double as "this clue is used once" columns). Search
// is Algorithm X with typed-array bookkeeping and an undo trail:
//   - MRV branching on the uncovered cell or unplaced clue with the fewest
//     live candidates;
//   - propagation to a fixpoint before every branch:
//       * a clue with a single live candidate is placed (forced);
//       * a cell only one clue can still reach must be covered by that clue,
//         so the clue's candidates that miss the cell are removed;
//       * the cells shared by all live candidates of a clue (their
//         intersection is a rectangle) belong to it, so other clues'
//         candidates that touch those cells are removed;
//       * each connected region of uncovered cells must be tiled by the
//         clues inside it, so their candidate areas must be able to add up
//         to the region's size (and candidates whose area cannot are removed);
//       * an uncovered cell with no live candidate, or an unplaced clue with
//         none, is a dead end;
//   - when the uncovered cells fall apart into separate regions, each region
//     is solved on its own (no thrashing over independent sub-puzzles);
//   - Luby restarts with a shuffled value order tame the heavy-tailed
//     runtimes of loosely clued (ANY, no area) puzzles. Still exact: budgets
//     grow without bound, so unsolvable puzzles return null.

export type PatchShape = 'SQUARE' | 'VERTICAL' | 'HORIZONTAL' | 'ANY';

export interface PatchesClue {
  cell: number;
  shape: PatchShape;
  /** required area, 0 = any */
  size: number;
}

export interface PatchesPuzzle {
  rows: number;
  cols: number;
  clues: PatchesClue[];
}

/** Rectangle as [top, left, height, width]. */
export type Rect = [number, number, number, number];

/**
 * Map LinkedIn's shape enum ('PatchesShapeConstraint_SQUARE',
 * 'PatchesShapeConstraint_VERTICAL_RECT', ...) to a shape. Deliberately loose:
 * anything not recognisably square / tall / wide is treated as ANY.
 */
export function parseShape(raw: unknown): PatchShape {
  const s = String(raw ?? '').toUpperCase();
  if (s.includes('SQUARE')) return 'SQUARE';
  if (s.includes('VERTICAL') || s.includes('TALL') || s.includes('PORTRAIT')) return 'VERTICAL';
  if (s.includes('HORIZONTAL') || s.includes('WIDE') || s.includes('LANDSCAPE')) return 'HORIZONTAL';
  return 'ANY';
}

function shapeOk(shape: PatchShape, h: number, w: number) {
  switch (shape) {
    case 'SQUARE': return h === w;
    case 'VERTICAL': return h > w;
    case 'HORIZONTAL': return w > h;
    default: return true;
  }
}

export interface SolveOptions {
  /** give up (return null, stats.aborted = true) after this many search nodes */
  maxNodes?: number;
  /** filled in with search statistics */
  stats?: { nodes: number; candidates: number; aborted: boolean; restarts?: number };
}

/** Luby restart sequence 1 1 2 1 1 2 4 1 1 2 1 1 2 4 8 ... (i >= 1). */
function luby(i: number): number {
  for (;;) {
    let k = 1;
    while ((1 << k) - 1 < i) k++;
    if ((1 << k) - 1 === i) return 1 << (k - 1);
    i -= (1 << (k - 1)) - 1;
  }
}

export function solvePatches(p: PatchesPuzzle, opts: SolveOptions = {}): Rect[] | null {
  const stats = opts.stats ?? { nodes: 0, candidates: 0, aborted: false };
  stats.nodes = 0; stats.candidates = 0; stats.aborted = false; stats.restarts = 0;
  const maxNodes = opts.maxNodes ?? Infinity;

  const { rows, cols, clues } = p;
  if (!(Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0)) return null;
  const n = rows * cols;
  const K = clues.length;
  if (K === 0) return null;

  const clueAt = new Int32Array(n).fill(-1);
  let totalSize = 0;
  for (let i = 0; i < K; i++) {
    const c = clues[i].cell;
    if (!Number.isInteger(c) || c < 0 || c >= n || clueAt[c] >= 0) return null;
    clueAt[c] = i;
    totalSize += clues[i].size || 0;
  }
  if (totalSize > n) return null;

  // 2D prefix count of clue cells: O(1) "does this rect hold a foreign clue".
  const W1 = cols + 1;
  const pre = new Int32Array((rows + 1) * W1);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      pre[(y + 1) * W1 + x + 1] = (clueAt[y * cols + x] >= 0 ? 1 : 0)
        + pre[y * W1 + x + 1] + pre[(y + 1) * W1 + x] - pre[y * W1 + x];
  const cluesIn = (t: number, l: number, b: number, r: number) =>
    pre[(b + 1) * W1 + r + 1] - pre[t * W1 + r + 1] - pre[(b + 1) * W1 + l] + pre[t * W1 + l];

  // ---- candidates (ids grouped by clue: clue i owns [clueFirst[i], clueFirst[i+1])) ----
  const cT: number[] = [], cL: number[] = [], cB: number[] = [], cR: number[] = [], cClue: number[] = [];
  const clueFirst = new Int32Array(K + 1);
  for (let ci = 0; ci < K; ci++) {
    clueFirst[ci] = cT.length;
    const { cell, shape } = clues[ci];
    const size = clues[ci].size || 0;
    const cr = Math.floor(cell / cols), cc = cell % cols;
    for (let t = cr; t >= 0; t--) {
      if (cluesIn(t, cc, cr, cc) > 1) break;
      for (let l = cc; l >= 0; l--) {
        if (cluesIn(t, l, cr, cc) > 1) break;
        for (let b = cr; b < rows; b++) {
          const h = b - t + 1;
          if (size && h * (cc - l + 1) > size) break;
          if (cluesIn(t, l, b, cc) > 1) break;
          for (let r = cc; r < cols; r++) {
            const w = r - l + 1;
            if (size && h * w > size) break;
            if (cluesIn(t, l, b, r) > 1) break;
            if (size && h * w !== size) continue;
            if (!shapeOk(shape, h, w)) continue;
            cT.push(t); cL.push(l); cB.push(b); cR.push(r); cClue.push(ci);
          }
        }
      }
    }
  }
  const m = cT.length;
  clueFirst[K] = m;
  stats.candidates = m;
  for (let ci = 0; ci < K; ci++) if (clueFirst[ci] === clueFirst[ci + 1]) return null;

  const candT = Int32Array.from(cT), candL = Int32Array.from(cL);
  const candB = Int32Array.from(cB), candR = Int32Array.from(cR), candClue = Int32Array.from(cClue);

  // Flat cell lists per candidate, and candidate lists per cell (CSR).
  const candStart = new Int32Array(m + 1);
  for (let j = 0; j < m; j++)
    candStart[j + 1] = candStart[j] + (candB[j] - candT[j] + 1) * (candR[j] - candL[j] + 1);
  const candCells = new Int32Array(candStart[m]);
  const cellDeg = new Int32Array(n + 1);
  for (let j = 0, k = 0; j < m; j++)
    for (let y = candT[j]; y <= candB[j]; y++)
      for (let x = candL[j]; x <= candR[j]; x++) {
        const c = y * cols + x;
        candCells[k++] = c;
        cellDeg[c + 1]++;
      }
  const cellStart = new Int32Array(n + 1);
  for (let c = 0; c < n; c++) cellStart[c + 1] = cellStart[c] + cellDeg[c + 1];
  const cellCands = new Int32Array(cellStart[n]);
  const fill = cellStart.slice(0, n);
  for (let j = 0; j < m; j++)
    for (let k = candStart[j]; k < candStart[j + 1]; k++) cellCands[fill[candCells[k]]++] = j;

  // ---- mutable state ----
  const alive = new Uint8Array(m).fill(1);
  const covered = new Uint8Array(n);
  const cellCount = new Int32Array(n);       // live candidates covering the cell
  const cellClueCnt = new Int32Array(n * K); // live candidates of clue X covering cell
  const cellDistinct = new Int32Array(n);    // clues with a live candidate on the cell
  const cellClueSum = new Int32Array(n);     // sum of those clue ids (== the clue when distinct is 1)
  const clueCount = new Int32Array(K);       // live candidates per clue
  const placed = new Int32Array(K).fill(-1); // chosen candidate per clue
  for (let j = 0; j < m; j++) {
    const ci = candClue[j];
    clueCount[ci]++;
    for (let k = candStart[j]; k < candStart[j + 1]; k++) {
      const c = candCells[k];
      cellCount[c]++;
      if (cellClueCnt[c * K + ci]++ === 0) { cellDistinct[c]++; cellClueSum[c] += ci; }
    }
  }
  for (let c = 0; c < n; c++) if (cellCount[c] === 0) return null;

  const candArea = new Int32Array(m);
  for (let j = 0; j < m; j++) candArea[j] = candStart[j + 1] - candStart[j];
  const clueMinA = new Int32Array(K), clueMaxA = new Int32Array(K);
  // A clue's intersection / area bounds only need recomputing after its own
  // candidate set changed (kills or undo); the rest is already at a fixpoint.
  const clueDirty = new Uint8Array(K).fill(1);
  const comp = new Int32Array(n), queue = new Int32Array(n);
  const compSize = new Int32Array(n), compMin = new Int32Array(n), compMax = new Int32Array(n);

  const trail = new Int32Array(m);   // killed candidates, in kill order
  let tp = 0;
  const placeStack = new Int32Array(K);
  let pp = 0;

  const kill = (j: number) => {
    alive[j] = 0;
    trail[tp++] = j;
    const ci = candClue[j];
    clueCount[ci]--;
    clueDirty[ci] = 1;
    for (let k = candStart[j], e = candStart[j + 1]; k < e; k++) {
      const c = candCells[k];
      cellCount[c]--;
      if (--cellClueCnt[c * K + ci] === 0) { cellDistinct[c]--; cellClueSum[c] -= ci; }
    }
  };

  const place = (j: number) => {
    const s = candStart[j], e = candStart[j + 1];
    placed[candClue[j]] = j;
    placeStack[pp++] = j;
    for (let k = s; k < e; k++) covered[candCells[k]] = 1;
    // Everything touching these cells dies, including j and all of its clue's
    // other candidates (they share the clue cell).
    for (let k = s; k < e; k++) {
      const c = candCells[k];
      for (let q = cellStart[c], qe = cellStart[c + 1]; q < qe; q++) {
        const o = cellCands[q];
        if (alive[o]) kill(o);
      }
    }
  };

  const undo = (tmark: number, pmark: number) => {
    while (tp > tmark) {
      const j = trail[--tp];
      alive[j] = 1;
      const ci = candClue[j];
      clueCount[ci]++;
      clueDirty[ci] = 1;
      for (let k = candStart[j], e = candStart[j + 1]; k < e; k++) {
        const c = candCells[k];
        cellCount[c]++;
        if (cellClueCnt[c * K + ci]++ === 0) { cellDistinct[c]++; cellClueSum[c] += ci; }
      }
    }
    while (pp > pmark) {
      const j = placeStack[--pp];
      placed[candClue[j]] = -1;
      for (let k = candStart[j], e = candStart[j + 1]; k < e; k++) covered[candCells[k]] = 0;
    }
  };

  /** Apply deductions until nothing changes. false = contradiction. */
  const propagate = (): boolean => {
    for (;;) {
      let changed = false;
      for (let ci = 0; ci < K; ci++) {
        if (placed[ci] >= 0) continue;
        const cnt = clueCount[ci];
        if (cnt === 0) return false;
        const s = clueFirst[ci], e = clueFirst[ci + 1];
        if (cnt === 1) {
          let j = s;
          while (!alive[j]) j++;
          place(j);
          changed = true;
          continue;
        }
        if (!clueDirty[ci]) continue;
        clueDirty[ci] = 0;
        // Intersection of all live candidates: those cells are this clue's.
        let t = 0, l = 0, b = rows, r = cols, amin = n, amax = 0;
        for (let j = s; j < e; j++) {
          if (!alive[j]) continue;
          if (candT[j] > t) t = candT[j];
          if (candL[j] > l) l = candL[j];
          if (candB[j] < b) b = candB[j];
          if (candR[j] < r) r = candR[j];
          const a = candArea[j];
          if (a < amin) amin = a;
          if (a > amax) amax = a;
        }
        clueMinA[ci] = amin;
        clueMaxA[ci] = amax;
        for (let y = t; y <= b; y++)
          for (let x = l; x <= r; x++) {
            const c = y * cols + x;
            if (cellDistinct[c] === 1) continue;
            for (let q = cellStart[c], qe = cellStart[c + 1]; q < qe; q++) {
              const o = cellCands[q];
              if (alive[o] && candClue[o] !== ci) { kill(o); changed = true; }
            }
          }
      }
      for (let c = 0; c < n; c++) {
        if (covered[c]) continue;
        if (cellCount[c] === 0) return false;
        if (cellDistinct[c] !== 1) continue;
        // Only clue ci can still reach c: drop its candidates that miss c.
        const ci = cellClueSum[c];
        if (clueCount[ci] === cellClueCnt[c * K + ci]) continue;
        const y = Math.floor(c / cols), x = c - y * cols;
        for (let j = clueFirst[ci], e = clueFirst[ci + 1]; j < e; j++)
          if (alive[j] && (y < candT[j] || y > candB[j] || x < candL[j] || x > candR[j])) {
            kill(j);
            changed = true;
          }
      }
      if (changed) continue;
      // Nothing changed this round, so clueMinA/clueMaxA are current. Each
      // connected region of uncovered cells must be tiled exactly by the
      // clues inside it: their areas must add up to the region's size.
      let nc = 0;
      comp.fill(-1);
      for (let c0 = 0; c0 < n; c0++) {
        if (covered[c0] || comp[c0] >= 0) continue;
        let qh = 0, qt = 0;
        queue[qt++] = c0;
        comp[c0] = nc;
        while (qh < qt) {
          const c = queue[qh++];
          const y = Math.floor(c / cols), x = c - y * cols;
          if (y > 0 && !covered[c - cols] && comp[c - cols] < 0) { comp[c - cols] = nc; queue[qt++] = c - cols; }
          if (y < rows - 1 && !covered[c + cols] && comp[c + cols] < 0) { comp[c + cols] = nc; queue[qt++] = c + cols; }
          if (x > 0 && !covered[c - 1] && comp[c - 1] < 0) { comp[c - 1] = nc; queue[qt++] = c - 1; }
          if (x < cols - 1 && !covered[c + 1] && comp[c + 1] < 0) { comp[c + 1] = nc; queue[qt++] = c + 1; }
        }
        compSize[nc] = qt;
        compMin[nc] = 0;
        compMax[nc] = 0;
        nc++;
      }
      for (let ci = 0; ci < K; ci++) {
        if (placed[ci] >= 0) continue;
        const k = comp[clues[ci].cell];
        compMin[k] += clueMinA[ci];
        compMax[k] += clueMaxA[ci];
      }
      for (let k = 0; k < nc; k++)
        if (compMin[k] > compSize[k] || compMax[k] < compSize[k]) return false;
      for (let ci = 0; ci < K; ci++) {
        if (placed[ci] >= 0) continue;
        const k = comp[clues[ci].cell];
        const lo = compSize[k] - (compMax[k] - clueMaxA[ci]);
        const hi = compSize[k] - (compMin[k] - clueMinA[ci]);
        if (lo <= clueMinA[ci] && hi >= clueMaxA[ci]) continue;
        for (let j = clueFirst[ci], e = clueFirst[ci + 1]; j < e; j++)
          if (alive[j] && (candArea[j] < lo || candArea[j] > hi)) { kill(j); changed = true; }
      }
      if (!changed) return true;
    }
  };

  // search(region): cover every cell of `region` (a union of whole connected
  // regions of uncovered cells). Candidates never straddle two regions, so
  // when the region falls apart each piece is solved on its own and a dead
  // piece fails the whole node at once instead of being re-proved dead under
  // every combination of choices made in its neighbours.
  const branchBuf: Int32Array[] = [], regionBuf: Int32Array[] = [];
  const search = (depth: number, region: ArrayLike<number>, regionLen: number): boolean => {
    if (++stats.nodes > maxNodes) { stats.aborted = true; return false; }
    if (++runNodes > runLimit) { cut = true; return false; }
    if (!propagate()) return false;
    // propagate() just recomputed comp[] for the uncovered cells.
    const cells = (regionBuf[depth] ??= new Int32Array(n));
    let rem = 0, k0 = -1, split = false;
    for (let i = 0; i < regionLen; i++) {
      const c = region[i];
      if (covered[c]) continue;
      cells[rem++] = c;
      if (k0 < 0) k0 = comp[c];
      else if (comp[c] !== k0) split = true;
    }
    if (rem === 0) return true;
    if (split) {
      const groups = new Map<number, number[]>();
      for (let i = 0; i < rem; i++) {
        const k = comp[cells[i]];
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(cells[i]);
      }
      const parts = [...groups.values()].sort((x, y) => x.length - y.length);
      for (const part of parts) if (!search(depth + 1, part, part.length)) return false;
      return true;
    }
    // MRV: the cell or clue (clue cells are uncovered exactly while the clue
    // is unplaced) with the fewest live candidates.
    let best = Infinity, bestCell = -1, bestClue = -1;
    for (let i = 0; i < rem; i++) {
      const c = cells[i];
      if (cellCount[c] < best) { best = cellCount[c]; bestCell = c; bestClue = -1; }
      const ci = clueAt[c];
      if (ci >= 0 && clueCount[ci] < best) { best = clueCount[ci]; bestClue = ci; }
    }
    if (best === 0) return false;
    const options = (branchBuf[depth] ??= new Int32Array(m));
    let no = 0;
    if (bestClue >= 0) {
      for (let j = clueFirst[bestClue], e = clueFirst[bestClue + 1]; j < e; j++) if (alive[j]) options[no++] = j;
    } else {
      for (let q = cellStart[bestCell], qe = cellStart[bestCell + 1]; q < qe; q++)
        if (alive[cellCands[q]]) options[no++] = cellCands[q];
    }
    const tmark = tp, pmark = pp;
    if (shuffle) for (let i = no - 1; i > 0; i--) {
      const r = Math.floor(rand() * (i + 1)); const t = options[i]; options[i] = options[r]; options[r] = t;
    }
    for (let i = 0; i < no; i++) {
      place(options[i]);
      if (search(depth + 1, cells, rem)) return true;
      if (stats.aborted || cut) return false;
      undo(tmark, pmark);
    }
    return false;
  };

  // Search times are heavy-tailed: one early wrong placement can take a long
  // refutation while a different value order finds a solution in a few dozen
  // nodes. So run with a node budget following the Luby sequence, shuffling
  // the value order (deterministically) on every restart. Budgets grow without
  // bound, so the search stays complete and unsolvable puzzles return null.
  const all = new Int32Array(n);
  for (let c = 0; c < n; c++) all[c] = c;
  let seed = 0x2545f491;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let shuffle = false, runNodes = 0, runLimit = 0, cut = false;
  const base = 64 + 2 * K;
  for (let run = 1; ; run++) {
    runNodes = 0;
    runLimit = luby(run) * base;
    cut = false;
    if (search(0, all, n)) break;
    if (stats.aborted || !cut) return null;
    undo(0, 0);
    clueDirty.fill(1);
    shuffle = true;
    stats.restarts = run;
  }
  return clues.map((_, ci) => {
    const j = placed[ci];
    return [candT[j], candL[j], candB[j] - candT[j] + 1, candR[j] - candL[j] + 1] as Rect;
  });
}

export function checkPatches(p: PatchesPuzzle, rects: Rect[] | null | undefined): boolean {
  if (!rects || rects.length !== p.clues.length) return false;
  const n = p.rows * p.cols;
  const owner = new Int32Array(n).fill(-1);
  for (let i = 0; i < rects.length; i++) {
    const [t, l, h, w] = rects[i];
    const clue = p.clues[i];
    if (![t, l, h, w].every(Number.isInteger) || h < 1 || w < 1) return false;
    if (t < 0 || l < 0 || t + h > p.rows || l + w > p.cols) return false;
    if (!shapeOk(clue.shape, h, w) || (clue.size && h * w !== clue.size)) return false;
    for (let y = t; y < t + h; y++)
      for (let x = l; x < l + w; x++) {
        const c = y * p.cols + x;
        if (owner[c] >= 0) return false;
        owner[c] = i;
      }
    if (owner[clue.cell] !== i) return false;
  }
  return owner.every((o) => o >= 0);
}
