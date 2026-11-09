// Zip: draw one path that visits every cell exactly once, passing the numbered
// cells in order (0, 1, 2, ...), starting on the first number and ending on the
// last, never crossing a wall.
//
// Solver: depth-first search that extends the path from its head, with strong
// pruning at every node. Every check is a necessary condition for the cells
// left to admit a path from the head to the end that passes the remaining
// numbers in order, so pruning never loses a solution:
//   1. edge propagation: each remaining cell needs 2 path edges (head and end:
//      1). A cell with exactly that many usable edges must use all of them; a
//      cell that has them drops the rest. Forced edges join into fragments, and
//      an edge is dropped if it would close a cycle, join head to end too early,
//      or put numbers out of order along a fragment.
//   2. biconnectivity (Tarjan from the head, over edges still usable): the
//      remaining cells must be connected, and every articulation vertex v must
//      split off exactly one part, which holds the end and the highest numbers.
//      Both sides must pass the colour-count test (see 4).
//   3. segments: the cells strictly between consecutive waypoints (head, next
//      number, ..., last number) are unnumbered and connected, so each segment
//      runs inside one component of the free (unnumbered) cells, or is a single
//      step. Each segment needs such an option, each component needs a segment,
//      and each component's black/white imbalance must be reachable from the
//      colours of the segment endpoints that can run through it.
//   4. parity: a path alternates colours on the chessboard colouring, so the
//      colour counts of the cells left are fixed by the colours of head and end.
// Moves: forced edge first, else fewest onward options (Warnsdorff). Failed
// (visited set, head) states are memoised with 64-bit Zobrist keys. Runs
// alternate between forward and reversed puzzles with Luby restarts.

export type WallDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface ZipPuzzle {
  rows: number;
  cols: number;
  /** cell index -> 0-based sequence number */
  numbers: Record<number, number>;
  /** a wall on `dir` side of cell */
  walls: [number, WallDir][];
}

export interface ZipSolveOptions {
  /** Abort after this many milliseconds (status 'aborted', path null). */
  timeoutMs?: number;
  /** Abort after this many search nodes. */
  maxNodes?: number;
}

export type ZipSolveStatus = 'solved' | 'unsolvable' | 'invalid' | 'aborted';

export interface ZipSolveResult {
  status: ZipSolveStatus;
  path: number[] | null;
  /** search nodes expanded */
  nodes: number;
  ms: number;
}

/** Adjacency lists honoring walls (order: up, down, left, right). */
export function zipNeighbors(p: ZipPuzzle): number[][] {
  const { rows, cols } = p;
  const n = rows * cols;
  // bit 1 up, 2 down, 4 left, 8 right
  const block = new Uint8Array(n);
  for (const [c, d] of p.walls ?? []) {
    if (!Number.isInteger(c) || c < 0 || c >= n) continue;
    const r = Math.floor(c / cols), q = c % cols;
    if (d === 'UP') { if (r > 0) { block[c] |= 1; block[c - cols] |= 2; } }
    else if (d === 'DOWN') { if (r < rows - 1) { block[c] |= 2; block[c + cols] |= 1; } }
    else if (d === 'LEFT') { if (q > 0) { block[c] |= 4; block[c - 1] |= 8; } }
    else if (d === 'RIGHT') { if (q < cols - 1) { block[c] |= 8; block[c + 1] |= 4; } }
  }
  const adj: number[][] = [];
  for (let c = 0; c < n; c++) {
    const r = Math.floor(c / cols), q = c % cols, b = block[c];
    const out: number[] = [];
    if (r > 0 && !(b & 1)) out.push(c - cols);
    if (r < rows - 1 && !(b & 2)) out.push(c + cols);
    if (q > 0 && !(b & 4)) out.push(c - 1);
    if (q < cols - 1 && !(b & 8)) out.push(c + 1);
    adj.push(out);
  }
  return adj;
}

/** Deterministic 32-bit PRNG (Zobrist keys). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  };
}

/** Open-addressing set of 64-bit keys (two int32 halves). */
class KeySet {
  private a: Int32Array;
  private b: Int32Array;
  private used: Uint8Array;
  private mask: number;
  private readonly maxSize: number;
  size = 0;
  constructor(maxSize: number, bits = 10) {
    this.maxSize = maxSize;
    this.a = new Int32Array(1 << bits);
    this.b = new Int32Array(1 << bits);
    this.used = new Uint8Array(1 << bits);
    this.mask = (1 << bits) - 1;
  }
  has(k1: number, k2: number): boolean {
    for (let i = k1 & this.mask; this.used[i]; i = (i + 1) & this.mask) {
      if (this.a[i] === k1 && this.b[i] === k2) return true;
    }
    return false;
  }
  add(k1: number, k2: number) {
    if (this.size >= this.maxSize) return;
    if ((this.size + 1) * 2 > this.mask + 1) this.grow();
    let i = k1 & this.mask;
    while (this.used[i]) {
      if (this.a[i] === k1 && this.b[i] === k2) return;
      i = (i + 1) & this.mask;
    }
    this.used[i] = 1; this.a[i] = k1; this.b[i] = k2;
    this.size++;
  }
  private grow() {
    const { a, b, used } = this;
    const cap = (this.mask + 1) * 2;
    this.a = new Int32Array(cap); this.b = new Int32Array(cap); this.used = new Uint8Array(cap);
    this.mask = cap - 1;
    this.size = 0;
    for (let i = 0; i < used.length; i++) if (used[i]) this.add(a[i], b[i]);
  }
}

/** A path of `len` cells alternating colours from colour `ca` to `cb` holds exactly this many colour-1 cells. */
function parityOk(len: number, blacks: number, ca: number, cb: number): boolean {
  if (len & 1) return ca === cb && blacks === (ca ? (len + 1) >> 1 : (len - 1) >> 1);
  return ca !== cb && blacks === len >> 1;
}

/** Puzzle data checked and indexed, or why it can't be searched. */
type Parsed =
  | { kind: 'search'; n: number; K: number; seq: Int32Array; cellOf: Int32Array }
  | { kind: 'done'; status: ZipSolveStatus; path: number[] | null };

function parse(p: ZipPuzzle): Parsed {
  const { rows, cols } = p ?? ({} as ZipPuzzle);
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    return { kind: 'done', status: 'invalid', path: null };
  }
  const n = rows * cols;
  const seq = new Int32Array(n).fill(-1);
  const entries = Object.entries(p.numbers ?? {});
  const K = entries.length;
  if (K === 0) return { kind: 'done', status: 'invalid', path: null };
  const cellOf = new Int32Array(K).fill(-1);
  for (const [ck, s] of entries) {
    const c = Number(ck);
    // numbers must be exactly 0..K-1, one cell each
    if (!Number.isInteger(c) || c < 0 || c >= n || !Number.isInteger(s) || s < 0 || s >= K || cellOf[s] >= 0) {
      return { kind: 'done', status: 'invalid', path: null };
    }
    seq[c] = s;
    cellOf[s] = c;
  }
  if (n === 1) return { kind: 'done', status: 'solved', path: [cellOf[0]] };
  if (K === 1) return { kind: 'done', status: 'unsolvable', path: null }; // start == end, more cells left
  return { kind: 'search', n, K, seq, cellOf };
}

class ZipSearch {
  // ---- puzzle ----
  readonly n: number;
  readonly K: number;
  readonly seq: Int32Array;
  readonly cellOf: Int32Array;
  readonly start: number;
  readonly end: number;
  readonly nb: Int32Array; // neighbour slots: cell*4 + i
  readonly nd: Uint8Array; // neighbour count
  readonly rev: Int32Array; // slot of the reverse edge
  readonly color: Uint8Array;

  // ---- search state ----
  readonly visited: Uint8Array;
  readonly path: Int32Array;
  head: number;
  next = 1; // next number to reach
  remaining: number; // unvisited cells
  unvisitedBlack: number;
  h1 = 0;
  h2 = 0;

  // ---- propagation scratch (valid for the state of the last feasible() call) ----
  readonly est: Uint8Array; // per slot: 0 unknown, 1 on, 2 off
  readonly on: Int32Array;
  readonly avail: Int32Array; // non-off edges
  readonly endp: Int32Array; // other endpoint of the fragment (valid at endpoints)
  readonly fsz: Int32Array; // fragment size, numbers count/min/max, nearest number (at endpoints)
  readonly fcnt: Int32Array;
  readonly fmin: Int32Array;
  readonly fmax: Int32Array;
  readonly near: Int32Array;
  readonly queue: Int32Array;
  readonly inQ: Uint8Array;

  // ---- Tarjan / component scratch ----
  readonly mark: Int32Array;
  epoch = 0;
  readonly disc: Int32Array;
  readonly low: Int32Array;
  readonly parent: Int32Array;
  readonly iter: Int32Array;
  readonly sz: Int32Array;
  readonly bl: Int32Array;
  readonly nc: Int32Array;
  readonly nm: Int32Array;
  readonly stk: Int32Array;
  readonly comp: Int32Array;
  readonly cImb: Int32Array;
  readonly cFSum: Int32Array;
  readonly cCnt: Int32Array;
  readonly cPos: Int32Array;
  readonly cNeg: Int32Array;
  readonly compsA = new Int32Array(4);

  // ---- memo ----
  readonly z1: Int32Array;
  readonly z2: Int32Array;
  readonly zh1: Int32Array;
  readonly zh2: Int32Array;
  readonly dead = new KeySet(4_000_000);
  readonly cand: Int32Array;
  readonly score: Int32Array;

  // ---- budget ----
  nodes = 0;
  aborted = false;
  deadline = Infinity;
  maxNodes = Infinity;
  /** tie-break noise for move ordering (randomised restarts); null = deterministic */
  rnd: (() => number) | null = null;

  constructor(p: ZipPuzzle, n: number, K: number, seq: Int32Array, cellOf: Int32Array) {
    this.n = n; this.K = K; this.seq = seq; this.cellOf = cellOf;
    this.start = cellOf[0]; this.end = cellOf[K - 1];
    // Drop edges no solution can use: between numbers that aren't consecutive,
    // and start-end while other cells remain.
    const adj = zipNeighbors(p).map((out, c) => out.filter((w) =>
      seq[c] < 0 || seq[w] < 0 ? true :
      Math.abs(seq[c] - seq[w]) === 1 && !(n > 2 && ((c === this.start && w === this.end) || (c === this.end && w === this.start)))));
    this.nb = new Int32Array(n * 4);
    this.nd = new Uint8Array(n);
    this.rev = new Int32Array(n * 4);
    this.color = new Uint8Array(n);
    let blacks = 0;
    for (let c = 0; c < n; c++) {
      this.nd[c] = adj[c].length;
      for (let i = 0; i < adj[c].length; i++) this.nb[c * 4 + i] = adj[c][i];
      this.color[c] = (Math.floor(c / p.cols) + (c % p.cols)) & 1;
      blacks += this.color[c];
    }
    for (let c = 0; c < n; c++) {
      for (let i = 0; i < adj[c].length; i++) this.rev[c * 4 + i] = adj[c][i] * 4 + adj[adj[c][i]].indexOf(c);
    }
    const I = () => new Int32Array(n);
    this.visited = new Uint8Array(n);
    this.path = I();
    this.est = new Uint8Array(n * 4);
    this.on = I(); this.avail = I(); this.endp = I(); this.fsz = I();
    this.fcnt = I(); this.fmin = I(); this.fmax = I(); this.near = I();
    this.queue = I(); this.inQ = new Uint8Array(n);
    this.mark = I(); this.disc = I(); this.low = I(); this.parent = I(); this.iter = I();
    this.sz = I(); this.bl = I(); this.nc = I(); this.nm = I(); this.stk = I();
    this.comp = I(); this.cImb = I(); this.cFSum = I(); this.cCnt = I(); this.cPos = I(); this.cNeg = I();
    this.cand = new Int32Array(n * 4); this.score = new Int32Array(n * 4);
    const rnd = mulberry32(0x5eed2a1f ^ n);
    this.z1 = I(); this.z2 = I(); this.zh1 = I(); this.zh2 = I();
    for (let c = 0; c < n; c++) { this.z1[c] = rnd(); this.z2[c] = rnd(); this.zh1[c] = rnd(); this.zh2[c] = rnd(); }

    this.head = this.start;
    this.visited[this.start] = 1;
    this.h1 = this.z1[this.start]; this.h2 = this.z2[this.start];
    this.path[0] = this.start;
    this.remaining = n - 1;
    this.unvisitedBlack = blacks - this.color[this.start];
  }

  visit(o: number) {
    this.visited[o] = 1;
    this.h1 ^= this.z1[o]; this.h2 ^= this.z2[o];
    this.remaining--;
    this.unvisitedBlack -= this.color[o];
    if (this.seq[o] >= 0) this.next++;
    this.head = o;
  }

  unvisit(o: number, prevHead: number) {
    this.visited[o] = 0;
    this.h1 ^= this.z1[o]; this.h2 ^= this.z2[o];
    this.remaining++;
    this.unvisitedBlack += this.color[o];
    if (this.seq[o] >= 0) this.next--;
    this.head = prevHead;
  }

  feasible(): boolean {
    return this.propagate() && this.articulation() && this.segments();
  }

  // ---------- 1. edge propagation ----------

  private req(c: number): number {
    return c === this.head || c === this.end ? 1 : 2;
  }

  /** Could edge a-b (both fragment endpoints with spare degree) be part of the path? */
  private canJoin(a: number, b: number): boolean {
    const { on, endp, fcnt, near, fmin, fmax } = this;
    if (on[a] >= this.req(a) || on[b] >= this.req(b)) return false;
    const A = endp[a];
    if (A === b) return false; // would close a cycle
    const B = endp[b];
    if (((A === this.head && B === this.end) || (A === this.end && B === this.head)) &&
        this.fsz[a] + this.fsz[b] !== this.remaining + 1) return false; // head reaches end too early
    if (fcnt[a] && fcnt[b]) {
      // numbers along a fragment are consecutive and monotone, so the nearest
      // number at each joined end must be that fragment's extreme, one apart
      const x = near[a], y = near[b];
      if (!((y === x + 1 && x === fmax[a] && y === fmin[b]) || (y === x - 1 && x === fmin[a] && y === fmax[b]))) {
        return false;
      }
    }
    return true;
  }

  private join(a: number, b: number) {
    const { endp, fsz, fcnt, near, fmin, fmax } = this;
    const A = endp[a], B = endp[b];
    const cx = fcnt[a], cy = fcnt[b];
    const nA = cx ? near[A] : near[b];
    const nB = cy ? near[B] : near[a];
    const s = fsz[a] + fsz[b];
    const lo = !cx ? fmin[b] : !cy ? fmin[a] : Math.min(fmin[a], fmin[b]);
    const hi = !cx ? fmax[b] : !cy ? fmax[a] : Math.max(fmax[a], fmax[b]);
    endp[A] = B; endp[B] = A;
    fsz[A] = fsz[B] = s;
    fcnt[A] = fcnt[B] = cx + cy;
    near[A] = nA; near[B] = nB;
    fmin[A] = fmin[B] = lo;
    fmax[A] = fmax[B] = hi;
  }

  private propagate(): boolean {
    const { n, nb, nd, rev, visited, head, est, on, avail, endp, fsz, fcnt, fmin, fmax, near, queue, inQ, seq } = this;
    const hv = this.next - 1; // the head stands for the last number passed
    let qh = 0, qt = 0, qn = 0;
    for (let c = 0; c < n; c++) {
      if (visited[c] && c !== head) continue;
      let a = 0;
      for (let k = c * 4, e = k + nd[c]; k < e; k++) {
        const w = nb[k];
        if (!visited[w] || w === head) { est[k] = 0; a++; } else est[k] = 2;
      }
      on[c] = 0; avail[c] = a; endp[c] = c; fsz[c] = 1;
      const num = c === head ? hv : seq[c];
      near[c] = num;
      if (num >= 0) { fcnt[c] = 1; fmin[c] = fmax[c] = num; } else fcnt[c] = 0;
      // initially only the head and tight cells can trigger a rule (edges
      // between incompatible numbers were dropped up front)
      if (c === head || a <= (c === this.end ? 1 : 2)) {
        queue[qt] = c; qt = qt + 1 === n ? 0 : qt + 1; qn++;
        inQ[c] = 1;
      } else inQ[c] = 0;
    }
    while (qn) {
      const c = queue[qh]; qh = qh + 1 === n ? 0 : qh + 1; qn--;
      inQ[c] = 0;
      const r = this.req(c);
      const k0 = c * 4, k1 = k0 + nd[c];
      if (on[c] === r) {
        for (let k = k0; k < k1; k++) {
          if (est[k] !== 0) continue;
          const w = nb[k];
          est[k] = est[rev[k]] = 2;
          avail[c]--; avail[w]--;
          if (!inQ[w]) { inQ[w] = 1; queue[qt] = w; qt = qt + 1 === n ? 0 : qt + 1; qn++; }
        }
        continue;
      }
      for (let k = k0; k < k1; k++) {
        if (est[k] !== 0) continue;
        const w = nb[k];
        if (this.canJoin(c, w)) continue;
        est[k] = est[rev[k]] = 2;
        avail[c]--; avail[w]--;
        if (!inQ[w]) { inQ[w] = 1; queue[qt] = w; qt = qt + 1 === n ? 0 : qt + 1; qn++; }
      }
      if (avail[c] < r) return false;
      if (avail[c] === r) {
        for (let k = k0; k < k1; k++) {
          if (est[k] !== 0) continue;
          const w = nb[k];
          if (!this.canJoin(c, w)) return false;
          est[k] = est[rev[k]] = 1;
          on[c]++; on[w]++;
          const A = endp[c], B = endp[w];
          this.join(c, w);
          // w and both new fragment ends need a fresh look
          if (!inQ[w]) { inQ[w] = 1; queue[qt] = w; qt = qt + 1 === n ? 0 : qt + 1; qn++; }
          if (!inQ[A]) { inQ[A] = 1; queue[qt] = A; qt = qt + 1 === n ? 0 : qt + 1; qn++; }
          if (!inQ[B]) { inQ[B] = 1; queue[qt] = B; qt = qt + 1 === n ? 0 : qt + 1; qn++; }
        }
      }
    }
    return true;
  }

  // ---------- 2. articulation points and parity ----------

  private articulation(): boolean {
    const { nb, nd, est, visited, head, end, seq, color, K, mark, disc, low, parent, iter, sz, bl, nc, nm, stk } = this;
    const remaining = this.remaining, ub = this.unvisitedBlack;
    const ep = ++this.epoch;
    let time = 0, rootChildren = 0;
    mark[head] = ep; disc[head] = low[head] = time++; parent[head] = -1; iter[head] = 0;
    let sp = 0;
    stk[sp++] = head;
    while (sp) {
      const v = stk[sp - 1];
      if (iter[v] < nd[v]) {
        const k = v * 4 + iter[v]++;
        if (est[k] === 2) continue;
        const w = nb[k];
        if (visited[w] && w !== head) continue;
        if (mark[w] !== ep) {
          mark[w] = ep; disc[w] = low[w] = time++; parent[w] = v; iter[w] = 0;
          sz[w] = 1; bl[w] = color[w];
          if (seq[w] >= 0) { nc[w] = 1; nm[w] = seq[w]; } else { nc[w] = 0; nm[w] = K; }
          stk[sp++] = w;
          if (v === head) rootChildren++;
        } else if (w !== parent[v] && disc[w] < low[v]) low[v] = disc[w];
      } else {
        sp--;
        const pv = parent[v];
        if (pv < 0 || pv === head) continue;
        if (low[v] < low[pv]) low[pv] = low[v];
        sz[pv] += sz[v]; bl[pv] += bl[v]; nc[pv] += nc[v];
        if (nm[v] < nm[pv]) nm[pv] = nm[v];
        if (low[v] >= disc[pv]) {
          // pv separates subtree(v): the path must finish everything else,
          // pass pv, then cover subtree(v) and stop at the end inside it.
          const de = disc[end];
          if (mark[end] !== ep || de < disc[v] || de >= disc[v] + sz[v]) return false;
          if (nc[v] !== K - nm[v]) return false; // subtree holds exactly the top numbers
          if (seq[pv] >= 0 && seq[pv] !== nm[v] - 1) return false;
          if (!parityOk(sz[v] + 1, bl[v] + color[pv], color[pv], color[end])) return false;
          if (!parityOk(remaining + 1 - sz[v], ub + color[head] - bl[v], color[head], color[pv])) return false;
        }
      }
    }
    if (rootChildren !== 1 || time !== remaining + 1) return false;
    return parityOk(remaining + 1, ub + color[head], color[head], color[end]);
  }

  // ---------- 3. segments between waypoints vs. free components ----------

  private segments(): boolean {
    const { n, nb, nd, est, visited, seq, color, cellOf, K, head, mark, stk, comp, cImb, cFSum, cCnt, cPos, cNeg, compsA } = this;
    const ep = ++this.epoch;
    let nComp = 0;
    for (let c = 0; c < n; c++) {
      if (visited[c] || seq[c] >= 0 || mark[c] === ep) continue;
      const id = nComp++;
      let imb = 0, sp = 0;
      stk[sp++] = c;
      mark[c] = ep;
      while (sp) {
        const v = stk[--sp];
        comp[v] = id;
        imb += color[v] ? 1 : -1;
        for (let k = v * 4, e = k + nd[v]; k < e; k++) {
          if (est[k] === 2) continue;
          const w = nb[k];
          if (visited[w] || seq[w] >= 0 || mark[w] === ep) continue;
          mark[w] = ep;
          stk[sp++] = w;
        }
      }
      cImb[id] = imb; cFSum[id] = 0; cCnt[id] = 0; cPos[id] = 0; cNeg[id] = 0;
    }
    for (let s = this.next - 1; s < K - 1; s++) {
      const a = s === this.next - 1 ? head : cellOf[s];
      const b = cellOf[s + 1];
      let direct = false, na = 0;
      for (let k = a * 4, e = k + nd[a]; k < e; k++) {
        if (est[k] === 2) continue;
        const w = nb[k];
        if (w === b) { direct = true; continue; }
        if (mark[w] !== ep || visited[w] || seq[w] >= 0) continue;
        const id = comp[w];
        let dup = false;
        for (let i = 0; i < na; i++) if (compsA[i] === id) dup = true;
        if (!dup) compsA[na++] = id;
      }
      let common = 0;
      for (let i = 0; i < na; i++) {
        const id = compsA[i];
        for (let k = b * 4, e = k + nd[b]; k < e; k++) {
          if (est[k] === 2) continue;
          const w = nb[k];
          if (mark[w] === ep && !visited[w] && seq[w] < 0 && comp[w] === id) { compsA[common++] = id; break; }
        }
      }
      if (!direct && common === 0) return false;
      // black-minus-white count of the cells strictly inside a segment a..b
      const ctr = color[a] === color[b] ? (color[a] ? -1 : 1) : 0;
      if (!direct && common === 1) {
        cFSum[compsA[0]] += ctr;
        cCnt[compsA[0]]++;
      } else {
        for (let i = 0; i < common; i++) {
          const id = compsA[i];
          cCnt[id]++;
          if (ctr > 0) cPos[id]++;
          else if (ctr < 0) cNeg[id]++;
        }
      }
    }
    for (let id = 0; id < nComp; id++) {
      if (cCnt[id] === 0) return false;
      const t = cImb[id] - cFSum[id];
      if (t > cPos[id] || t < -cNeg[id]) return false;
    }
    return true;
  }

  // ---------- search ----------

  /**
   * Precondition: remaining > 0 and the propagated edge states describe the
   * current state (feasible() returned true for it, or for its parent and the
   * last move followed a forced edge).
   */
  dfs(depth: number): boolean {
    if (this.aborted) return false;
    this.nodes++;
    if (this.nodes > this.maxNodes || ((this.nodes & 255) === 0 && performance.now() > this.deadline)) {
      this.aborted = true;
      return false;
    }
    const head = this.head;
    const k1 = this.h1 ^ this.zh1[head], k2 = this.h2 ^ this.zh2[head];
    if (this.dead.has(k1, k2)) return false;

    // candidate moves from the propagated edge states of this node
    const { nb, nd, est, avail, cand, score, end, visited } = this;
    const base = depth * 4;
    let m = 0, forced = false;
    for (let k = head * 4, e = k + nd[head]; k < e; k++) {
      const s = est[k];
      if (s === 2) continue;
      const o = nb[k];
      if (visited[o] || (o === end && this.remaining !== 1)) continue;
      if (s === 1) { cand[base] = o; m = 1; forced = true; break; }
      cand[base + m] = o;
      score[base + m] = this.rnd ? avail[o] * 16 + (this.rnd() & 15) : avail[o];
      m++;
    }
    // insertion sort by onward options (Warnsdorff)
    for (let i = 1; i < m; i++) {
      const co = cand[base + i], cs = score[base + i];
      let j = i - 1;
      while (j >= 0 && score[base + j] > cs) {
        cand[base + j + 1] = cand[base + j]; score[base + j + 1] = score[base + j]; j--;
      }
      cand[base + j + 1] = co; score[base + j + 1] = cs;
    }

    for (let i = 0; i < m; i++) {
      const o = cand[base + i];
      this.visit(o);
      this.path[depth] = o;
      if (this.remaining === 0) return true; // the end, reached last
      // a forced edge was already part of this node's propagation: the child's
      // checks would reach the same fixpoint, so skip straight to it
      if ((forced || this.feasible()) && this.dfs(depth + 1)) return true;
      this.unvisit(o, head);
      if (this.aborted) return false;
    }
    this.dead.add(k1, k2);
    return false;
  }
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

export function solveZip(p: ZipPuzzle, opts?: ZipSolveOptions): number[] | null {
  return solveZipDetailed(p, opts).path;
}

export function solveZipDetailed(p: ZipPuzzle, opts: ZipSolveOptions = {}): ZipSolveResult {
  const t0 = performance.now();
  const parsed = parse(p);
  if (parsed.kind === 'done') return { status: parsed.status, path: parsed.path, nodes: 0, ms: performance.now() - t0 };
  const { n, K, seq, cellOf } = parsed;
  const result = (status: ZipSolveStatus, path: number[] | null, nodes: number): ZipSolveResult =>
    ({ status, path, nodes, ms: performance.now() - t0 });

  // Backtracking run times are heavy-tailed, so search the puzzle forwards and
  // backwards (numbers reversed) in turn, with node budgets following the Luby
  // restart sequence and ties in the move order shuffled after the first two
  // runs. Failed states are facts about the puzzle, so each direction keeps its
  // memo across restarts and finished subtrees are never searched again. The
  // budgets grow without bound, so the search stays complete.
  const rseq = new Int32Array(n).fill(-1), rcell = new Int32Array(K);
  for (let s = 0; s < K; s++) { rcell[K - 1 - s] = cellOf[s]; rseq[cellOf[s]] = K - 1 - s; }
  const runs = [new ZipSearch(p, n, K, seq, cellOf), new ZipSearch(p, n, K, rseq, rcell)];
  if (!runs[0].feasible() || !runs[1].feasible()) return result('unsolvable', null, 0);

  const deadline = opts.timeoutMs != null ? t0 + opts.timeoutMs : Infinity;
  const maxTotal = opts.maxNodes ?? Infinity;
  let total = 0;
  const unit = Math.max(64, 2 * n); // nodes per Luby unit
  for (let run = 0; ; run++) {
    const i = run & 1;
    const s = runs[i];
    s.nodes = 0;
    s.aborted = false;
    s.maxNodes = Math.min(unit * luby((run >> 1) + 1), maxTotal - total);
    s.deadline = deadline;
    s.rnd = run < 2 ? null : mulberry32(run);
    const ok = s.feasible() && s.dfs(1);
    total += s.nodes;
    if (ok) {
      const path = Array.from(s.path);
      return result('solved', i === 0 ? path : path.reverse(), total);
    }
    if (!s.aborted) return result('unsolvable', null, total); // exhausted: no solution
    if (total >= maxTotal || performance.now() > deadline) return result('aborted', null, total);
  }
}

/**
 * Debug/test hook: replay a known-valid `path` and return the first prefix
 * length at which the pruning wrongly rejects it, or -1 if it never does.
 */
export function zipPruneTrace(p: ZipPuzzle, path: number[]): number {
  const parsed = parse(p);
  if (parsed.kind === 'done') return -1;
  const s = new ZipSearch(p, parsed.n, parsed.K, parsed.seq, parsed.cellOf);
  if (path[0] !== s.start) return 1;
  if (!s.feasible()) return 1;
  for (let i = 1; i < path.length - 1; i++) {
    s.visit(path[i]);
    if (!s.feasible()) return i + 1;
  }
  return -1;
}

/** Validate a candidate path against the rules. */
export function checkZip(p: ZipPuzzle, path: number[]): boolean {
  const n = p.rows * p.cols;
  if (!Array.isArray(path) || path.length !== n || new Set(path).size !== n) return false;
  if (!path.every((c) => Number.isInteger(c) && c >= 0 && c < n)) return false;
  const adj = zipNeighbors(p);
  for (let i = 1; i < n; i++) if (!adj[path[i - 1]].includes(path[i])) return false;
  const seen = path.map((c) => p.numbers[c]).filter((s) => s !== undefined);
  const k = Object.keys(p.numbers).length;
  return k > 0 && seen.length === k && seen.every((s, i) => s === i) && p.numbers[path[n - 1]] === k - 1;
}
