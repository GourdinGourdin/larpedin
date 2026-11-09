// Zip: draw one path that visits every cell exactly once, passing the numbered
// cells in order (0, 1, 2, ...), starting on the first number and ending on the
// last, never crossing a wall.

export type WallDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface ZipPuzzle {
  rows: number;
  cols: number;
  /** cell index -> 0-based sequence number */
  numbers: Record<number, number>;
  /** a wall on `dir` side of cell */
  walls: [number, WallDir][];
}

/** Adjacency lists honoring walls. */
export function zipNeighbors(p: ZipPuzzle): number[][] {
  const { rows, cols } = p;
  const n = rows * cols;
  const blocked = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const [c, d] of p.walls) {
    const r = Math.floor(c / cols), q = c % cols;
    const o =
      d === 'UP' ? (r > 0 ? c - cols : -1) :
      d === 'DOWN' ? (r < rows - 1 ? c + cols : -1) :
      d === 'LEFT' ? (q > 0 ? c - 1 : -1) :
      q < cols - 1 ? c + 1 : -1;
    if (o >= 0) blocked.add(key(c, o));
  }
  const adj: number[][] = [];
  for (let c = 0; c < n; c++) {
    const r = Math.floor(c / cols), q = c % cols;
    const out: number[] = [];
    if (r > 0) out.push(c - cols);
    if (r < rows - 1) out.push(c + cols);
    if (q > 0) out.push(c - 1);
    if (q < cols - 1) out.push(c + 1);
    adj.push(out.filter((o) => !blocked.has(key(c, o))));
  }
  return adj;
}

export function solveZip(p: ZipPuzzle): number[] | null {
  const n = p.rows * p.cols;
  const adj = zipNeighbors(p);
  const seq = new Int16Array(n).fill(-1);
  let maxSeq = -1;
  let start = -1, end = -1;
  for (const [c, s] of Object.entries(p.numbers)) {
    seq[+c] = s;
    if (s === 0) start = +c;
    if (s > maxSeq) { maxSeq = s; end = +c; }
  }
  if (start < 0) return null;

  const visited = new Uint8Array(n);
  const path = new Int32Array(n);
  // scratch buffers for the connectivity check
  const mark = new Int32Array(n);
  const stack = new Int32Array(n);
  let stamp = 0;
  const deg = new Int32Array(n);
  const forced = new Int32Array(n);

  const cellOfSeq = new Int32Array(maxSeq + 1);
  for (let c = 0; c < n; c++) if (seq[c] >= 0) cellOfSeq[seq[c]] = c;

  // The next number must be reachable from the head without stepping on any
  // other numbered cell.
  const nextReachable = (head: number, next: number): boolean => {
    if (next > maxSeq) return true;
    const target = cellOfSeq[next];
    stamp++;
    let sp = 0;
    stack[sp++] = head;
    mark[head] = stamp;
    while (sp) {
      const c = stack[--sp];
      for (const o of adj[c]) {
        if (visited[o] || mark[o] === stamp) continue;
        if (o === target) return true;
        if (seq[o] >= 0) continue;
        mark[o] = stamp;
        stack[sp++] = o;
      }
    }
    return false;
  };

  // Every unvisited cell must be reachable from the head through unvisited
  // cells, and no unvisited cell other than the end may be a dead end.
  const feasible = (head: number, remaining: number, next: number): boolean => {
    if (!nextReachable(head, next)) return false;
    stamp++;
    let sp = 0, seen = 0;
    stack[sp++] = head;
    mark[head] = stamp;
    while (sp) {
      const c = stack[--sp];
      for (const o of adj[c]) {
        if (!visited[o] && mark[o] !== stamp) {
          mark[o] = stamp;
          seen++;
          stack[sp++] = o;
        }
      }
    }
    if (seen !== remaining) return false;
    let deadEnds = 0;
    for (let c = 0; c < n; c++) {
      if (visited[c]) continue;
      let d = 0;
      for (const o of adj[c]) if (!visited[o] || o === head) d++;
      deg[c] = d;
      if (d <= 1) {
        if (c !== end) return false;
        deadEnds++;
      }
    }
    if (deadEnds > 1) return false;
    // A non-end cell with exactly two links must use both ("forced edges").
    // A cell can take at most 2 forced edges (end and head: at most 1).
    forced.fill(0);
    for (let c = 0; c < n; c++) {
      if (visited[c] || c === end || deg[c] !== 2) continue;
      for (const o of adj[c]) {
        if (visited[o] && o !== head) continue;
        const cap = o === head || o === end ? 1 : 2;
        if (++forced[o] > cap) return false;
      }
    }
    return true;
  };

  // Zobrist hashing of (visited set, head): the rest of the search depends
  // only on these, so a position that failed once fails every time.
  const z1 = new Int32Array(n), z2 = new Int32Array(n);
  for (let c = 0; c < n; c++) {
    z1[c] = (Math.random() * 2 ** 32) | 0;
    z2[c] = (Math.random() * 2 ** 32) | 0;
  }
  let h1 = 0, h2 = 0;
  const dead = new Set<string>();

  const dfs = (head: number, depth: number, next: number): boolean => {
    if (depth === n) return head === end;
    const key = `${h1},${h2},${head}`;
    if (dead.has(key)) return false;
    if (search(head, depth, next)) return true;
    if (dead.size < 2_000_000) dead.add(key);
    return false;
  };

  const search = (head: number, depth: number, next: number): boolean => {
    const remaining = n - depth;
    // candidate moves, ordered by fewest onward options (Warnsdorff)
    const cand: number[] = [];
    const score: number[] = [];
    for (const o of adj[head]) {
      if (visited[o]) continue;
      const s = seq[o];
      if (s >= 0 && s !== next) continue;
      if (o === end && remaining !== 1) continue;
      let deg = 0;
      for (const w of adj[o]) if (!visited[w]) deg++;
      cand.push(o);
      score.push(deg);
    }
    const order = cand.map((_, i) => i).sort((a, b) => score[a] - score[b]);
    for (const i of order) {
      const o = cand[i];
      visited[o] = 1;
      h1 ^= z1[o]; h2 ^= z2[o];
      path[depth] = o;
      const nn = seq[o] >= 0 ? next + 1 : next;
      if ((remaining === 1 || feasible(o, remaining - 1, nn)) && dfs(o, depth + 1, nn)) return true;
      visited[o] = 0;
      h1 ^= z1[o]; h2 ^= z2[o];
    }
    return false;
  };

  visited[start] = 1;
  path[0] = start;
  if (n === 1) return [start];
  if (!feasible(start, n - 1, 1)) return null;
  return dfs(start, 1, 1) ? Array.from(path) : null;
}

/** Validate a candidate path against the rules. */
export function checkZip(p: ZipPuzzle, path: number[]): boolean {
  const n = p.rows * p.cols;
  if (path.length !== n || new Set(path).size !== n) return false;
  const adj = zipNeighbors(p);
  for (let i = 1; i < n; i++) if (!adj[path[i - 1]].includes(path[i])) return false;
  const seen = path.map((c) => p.numbers[c]).filter((s) => s !== undefined);
  const k = Object.keys(p.numbers).length;
  return seen.every((s, i) => s === i) && seen.length === k && p.numbers[path[n - 1]] === k - 1;
}
