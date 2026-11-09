// Wend: a grid of letter tiles (some cells are holes) hides k words of given
// lengths. Each word is a path of orthogonally adjacent cells read from its
// first cell; together the words use every letter tile exactly once.
//
// Solver:
//  1. Filter the dictionary to words of a needed length whose letters fit in
//     the grid's letter counts, and build a trie of them.
//  2. Walk self-avoiding paths from every letter cell along the trie (prefix
//     pruning); every path that spells a word of a needed length is a candidate.
//  3. Exact cover of the letter cells by candidates whose lengths form the
//     length multiset: branch on the uncovered cell with the fewest compatible
//     candidates (MRV), common words first.
//  4. If several covers exist, keep the most common one: cost = sum over the
//     words of (rank + 1)^2, rank = commonness level (0 = most common). Ties go
//     to the cover found first (deterministic).

export interface WendPuzzle {
  rows: number;
  cols: number;
  /** row-major tiles; '' (or anything without a letter) = hole */
  letters: string[];
  /** word lengths, e.g. [3, 5, 6, 7]; the result lists paths in this order */
  lengths: number[];
}

/** Upper-case A-Z words; ranks[i] = commonness level of words[i] (0 = most common). */
export interface WendDict {
  words: string[];
  ranks?: ArrayLike<number>;
}

export interface WendCover {
  /** one path (cell indices, first letter first) per entry of `lengths`, same order */
  paths: number[][];
  words: string[];
  cost: number;
}

export interface WendOptions {
  /** stop after this many covers (solveAllWend default 1000) */
  maxCovers?: number;
  /** give up after this many ms; the best cover found so far is returned */
  timeoutMs?: number;
}

interface Candidate { path: number[]; word: string; rank: number }

const tileOf = (s: unknown) => String(s ?? '').normalize('NFD').toUpperCase().replace(/[^A-Z]/g, '');

function neighbors(rows: number, cols: number): number[][] {
  const adj: number[][] = [];
  for (let c = 0; c < rows * cols; c++) {
    const r = Math.floor(c / cols), q = c % cols, out: number[] = [];
    if (r > 0) out.push(c - cols);
    if (r < rows - 1) out.push(c + cols);
    if (q > 0) out.push(c - 1);
    if (q < cols - 1) out.push(c + 1);
    adj.push(out);
  }
  return adj;
}

function validShape(p: WendPuzzle): boolean {
  return Number.isInteger(p.rows) && Number.isInteger(p.cols) && p.rows > 0 && p.cols > 0 &&
    Array.isArray(p.letters) && p.letters.length === p.rows * p.cols &&
    Array.isArray(p.lengths) && p.lengths.length > 0 && p.lengths.every((l) => Number.isInteger(l) && l > 0);
}

/** Every path through the grid that spells a dictionary word of a needed length. */
export function wendCandidates(p: WendPuzzle, dict: WendDict): Candidate[] {
  if (!validShape(p)) return [];
  const n = p.rows * p.cols;
  const tiles = p.letters.map(tileOf);
  const need = new Set(p.lengths);
  const maxLen = Math.max(...p.lengths);

  // 1. letters available in the grid
  const have = new Int32Array(26);
  for (const t of tiles) for (let i = 0; i < t.length; i++) have[t.charCodeAt(i) - 65]++;

  // 2. words that fit, then a trie of them (flat arrays; node 0 = root)
  const fit: number[] = [];
  let cap = 1;
  const cnt = new Int32Array(26);
  outer: for (let wi = 0; wi < dict.words.length; wi++) {
    const w = dict.words[wi];
    if (!need.has(w.length)) continue;
    cnt.fill(0);
    for (let i = 0; i < w.length; i++) {
      const k = w.charCodeAt(i) - 65;
      if (k < 0 || k >= 26 || ++cnt[k] > have[k]) continue outer;
    }
    fit.push(wi);
    cap += w.length;
  }
  const child = new Int32Array(cap * 26);
  const term = new Int32Array(cap).fill(-1);
  let nodes = 1;
  for (const wi of fit) {
    const w = dict.words[wi];
    let v = 0;
    for (let i = 0; i < w.length; i++) {
      const slot = v * 26 + w.charCodeAt(i) - 65;
      if (!child[slot]) child[slot] = nodes++;
      v = child[slot];
    }
    if (term[v] < 0) term[v] = wi;
  }

  // 3. self-avoiding walks along the trie
  const adj = neighbors(p.rows, p.cols);
  const out: Candidate[] = [];
  const used = new Uint8Array(n);
  const path: number[] = [];
  const ranks = dict.ranks;
  const step = (c: number, v: number, depth: number) => {
    const t = tiles[c];
    for (let i = 0; i < t.length; i++) {
      v = child[v * 26 + t.charCodeAt(i) - 65];
      if (!v) return;
    }
    depth += t.length;
    used[c] = 1;
    path.push(c);
    const wi = term[v];
    if (wi >= 0 && need.has(depth)) out.push({ path: path.slice(), word: dict.words[wi], rank: ranks ? ranks[wi] : 0 });
    if (depth < maxLen) for (const d of adj[c]) if (!used[d] && tiles[d]) step(d, v, depth);
    path.pop();
    used[c] = 0;
  };
  for (let c = 0; c < n; c++) if (tiles[c]) step(c, 0, 0);
  return out;
}

const wordCost = (rank: number) => (rank + 1) * (rank + 1);

/**
 * Search covers. `onCover` gets each one (paths in search order) and returns
 * true to stop. `bound()` gives a cost the partial cover must stay below.
 */
function search(
  p: WendPuzzle, cands: Candidate[], deadline: number,
  bound: () => number, onCover: (chosen: Candidate[], cost: number) => boolean,
): void {
  const n = p.rows * p.cols;
  const tiles = p.letters.map(tileOf);
  const letterCells: number[] = [];
  let totalLetters = 0;
  for (let c = 0; c < n; c++) if (tiles[c]) { letterCells.push(c); totalLetters += tiles[c].length; }
  if (p.lengths.reduce((a, b) => a + b, 0) !== totalLetters) return;

  const need = new Map<number, number>();
  for (const l of p.lengths) need.set(l, (need.get(l) ?? 0) + 1);
  const lenOf = (k: Candidate) => k.word.length;
  const byCell: number[][] = Array.from({ length: n }, () => []);
  // common words first, so the first covers found are cheap and bound the rest
  const order = cands.map((_, i) => i).sort((a, b) => cands[a].rank - cands[b].rank || a - b);
  for (const i of order) for (const c of cands[i].path) byCell[c].push(i);

  const used = new Uint8Array(n);
  const chosen: Candidate[] = [];
  let covered = 0, stop = false, ticks = 0;
  const fits = (k: Candidate) => {
    if (!need.get(lenOf(k))) return false;
    for (const c of k.path) if (used[c]) return false;
    return true;
  };
  const rec = (cost: number) => {
    if (stop) return;
    if (covered === letterCells.length) {
      if (onCover(chosen, cost)) stop = true;
      return;
    }
    if ((++ticks & 255) === 0 && performance.now() > deadline) { stop = true; return; }
    // MRV: uncovered cell with the fewest compatible candidates
    let best = -1, bestCount = Infinity;
    for (const c of letterCells) {
      if (used[c]) continue;
      let k = 0;
      for (const i of byCell[c]) if (fits(cands[i]) && ++k >= bestCount) break;
      if (k < bestCount) { best = c; bestCount = k; if (k === 0) return; }
    }
    for (const i of byCell[best]) {
      const k = cands[i];
      if (!fits(k)) continue;
      const nc = cost + wordCost(k.rank);
      if (nc >= bound()) continue;
      for (const c of k.path) used[c] = 1;
      covered += k.path.length;
      need.set(lenOf(k), need.get(lenOf(k))! - 1);
      chosen.push(k);
      rec(nc);
      chosen.pop();
      need.set(lenOf(k), need.get(lenOf(k))! + 1);
      covered -= k.path.length;
      for (const c of k.path) used[c] = 0;
      if (stop) return;
    }
  };
  rec(0);
}

/** Put the chosen words in the order of `lengths` (equal lengths: by first cell). */
function toCover(p: WendPuzzle, chosen: Candidate[], cost: number): WendCover {
  const pool = chosen.slice().sort((a, b) => a.word.length - b.word.length || a.path[0] - b.path[0]);
  const picked: Candidate[] = [];
  for (const l of p.lengths) {
    const i = pool.findIndex((k) => k.word.length === l);
    picked.push(pool.splice(i, 1)[0]);
  }
  return { paths: picked.map((k) => k.path), words: picked.map((k) => k.word), cost };
}

/** All covers (up to maxCovers), cheapest (most common words) first. */
export function solveAllWend(p: WendPuzzle, dict: WendDict, opts: WendOptions = {}): WendCover[] {
  const max = opts.maxCovers ?? 1000;
  const deadline = performance.now() + (opts.timeoutMs ?? 10_000);
  const out: WendCover[] = [];
  search(p, wendCandidates(p, dict), deadline, () => Infinity, (chosen, cost) => {
    out.push(toCover(p, chosen, cost));
    return out.length >= max;
  });
  return out.sort((a, b) => a.cost - b.cost);
}

/** The cheapest cover (branch and bound on cost), or null. */
export function solveWendDetailed(p: WendPuzzle, dict: WendDict, opts: WendOptions = {}): WendCover | null {
  const deadline = performance.now() + (opts.timeoutMs ?? 3000);
  let best: WendCover | null = null;
  search(p, wendCandidates(p, dict), deadline, () => best?.cost ?? Infinity, (chosen, cost) => {
    best = toCover(p, chosen, cost);
    return false;
  });
  return best;
}

/** Paths of the most common cover, in the order of `p.lengths`, or null. */
export function solveWend(p: WendPuzzle, dict: WendDict, opts: WendOptions = {}): number[][] | null {
  return solveWendDetailed(p, dict, opts)?.paths ?? null;
}

/** The words spelled by `paths`. */
export function wendWords(p: WendPuzzle, paths: number[][]): string[] {
  return paths.map((path) => path.map((c) => tileOf(p.letters[c])).join(''));
}

const dictSets = new WeakMap<WendDict, Set<string>>();

/**
 * Valid answer: one path per length (as a multiset), each a chain of
 * orthogonally adjacent letter cells, every letter cell used exactly once.
 * With `dict`, every word must also be in it.
 */
export function checkWend(p: WendPuzzle, paths: number[][] | null | undefined, dict?: WendDict): boolean {
  if (!paths || !validShape(p) || paths.length !== p.lengths.length) return false;
  const n = p.rows * p.cols;
  const tiles = p.letters.map(tileOf);
  const seen = new Uint8Array(n);
  for (const path of paths) {
    if (!Array.isArray(path) || !path.length) return false;
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (!Number.isInteger(c) || c < 0 || c >= n || !tiles[c] || seen[c]) return false;
      seen[c] = 1;
      if (i) {
        const a = path[i - 1];
        const dr = Math.abs(Math.floor(a / p.cols) - Math.floor(c / p.cols));
        const dc = Math.abs((a % p.cols) - (c % p.cols));
        if (dr + dc !== 1) return false;
      }
    }
  }
  for (let c = 0; c < n; c++) if (tiles[c] && !seen[c]) return false;
  const words = wendWords(p, paths);
  const got = words.map((w) => w.length).sort((a, b) => a - b);
  const want = p.lengths.slice().sort((a, b) => a - b);
  if (got.some((l, i) => l !== want[i])) return false;
  if (dict) {
    let set = dictSets.get(dict);
    if (!set) dictSets.set(dict, (set = new Set(dict.words)));
    if (!words.every((w) => set!.has(w))) return false;
  }
  return true;
}

/**
 * Random puzzle for tests/benchmarks: place random self-avoiding snakes of the
 * given lengths (longest first) on an empty grid, fill each with a random
 * dictionary word of rank <= maxRank; the cells left over are holes.
 * Returns null if the snakes could not be placed.
 */
export function generateWend(
  rows: number, cols: number, lengths: number[], rng: () => number, dict: WendDict, maxRank = 2,
): { puzzle: WendPuzzle; solution: number[][] } | null {
  const n = rows * cols;
  const adj = neighbors(rows, cols);
  const byLen = new Map<number, string[]>();
  dict.words.forEach((w, i) => {
    if ((dict.ranks ? dict.ranks[i] : 0) > maxRank) return;
    let l = byLen.get(w.length);
    if (!l) byLen.set(w.length, (l = []));
    l.push(w);
  });
  if (lengths.some((l) => !byLen.get(l)?.length) || lengths.reduce((a, b) => a + b, 0) > n) return null;

  const shuffle = <T>(a: T[]) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    const used = new Uint8Array(n);
    const placed: number[][] = new Array(lengths.length);
    const order = lengths.map((_, i) => i).sort((a, b) => lengths[b] - lengths[a]);
    let ok = true;
    for (const wi of order) {
      const L = lengths[wi];
      let budget = 2000;
      const walk: number[] = [];
      const grow = (c: number): boolean => {
        if (--budget < 0) return false;
        used[c] = 1; walk.push(c);
        if (walk.length === L) return true;
        for (const d of shuffle(adj[c].slice())) if (!used[d] && grow(d)) return true;
        used[c] = 0; walk.pop();
        return false;
      };
      const starts = shuffle([...Array(n).keys()].filter((c) => !used[c]));
      let found = false;
      for (const s of starts.slice(0, 12)) if (grow(s)) { found = true; break; }
      if (!found) { ok = false; break; }
      placed[wi] = walk.slice();
    }
    if (!ok) continue;
    const letters = new Array<string>(n).fill('');
    placed.forEach((path, i) => {
      const list = byLen.get(lengths[i])!;
      const w = list[Math.floor(rng() * list.length)];
      path.forEach((c, j) => { letters[c] = w[j]; });
    });
    return { puzzle: { rows, cols, letters, lengths: lengths.slice() }, solution: placed };
  }
  return null;
}
