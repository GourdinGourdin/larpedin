import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  solveTango, checkTango, countTangoSolutions, generateTango, type TangoPuzzle,
} from '../src/solvers/tango.ts';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reference count by brute force over valid rows (fine for N <= 6). */
function bruteCount(p: TangoPuzzle): number {
  const N = p.size, half = N / 2;
  const rows: number[][] = [];
  for (let m = 0; m < 1 << N; m++) {
    const r = Array.from({ length: N }, (_, j) => (m >> j) & 1);
    if (r.filter((v) => v).length !== half) continue;
    if (r.some((v, j) => j >= 2 && v === r[j - 1] && v === r[j - 2])) continue;
    rows.push(r);
  }
  const grid: number[] = [];
  let count = 0;
  const rec = (i: number) => {
    if (i === N) { if (checkTango(p, grid)) count++; return; }
    for (const r of rows) {
      if (r.some((v, j) => (i * N + j) in p.given && p.given[i * N + j] !== v)) continue;
      grid.push(...r);
      let ok = true;
      for (let c = 0; c < N && ok; c++) {
        let ones = 0;
        for (let k = 0; k <= i; k++) ones += grid[k * N + c];
        if (ones > half || i + 1 - ones > half) ok = false;
        if (i >= 2 && grid[i * N + c] === grid[(i - 1) * N + c] && grid[i * N + c] === grid[(i - 2) * N + c]) ok = false;
      }
      if (ok) rec(i + 1);
      grid.length -= N;
    }
  };
  rec(0);
  return count;
}

/** Random clues that need not agree with any solution. */
function randomClues(N: number, rng: () => number, givens: number, edges: number): TangoPuzzle {
  const given: Record<number, number> = {};
  for (let i = 0; i < givens; i++) given[Math.floor(rng() * N * N)] = rng() < 0.5 ? 0 : 1;
  const es: [number, number, '=' | 'x'][] = [];
  for (let i = 0; i < edges; i++) {
    const c = Math.floor(rng() * N * N);
    const right = rng() < 0.5;
    if (right ? c % N === N - 1 : c + N >= N * N) continue;
    es.push([c, right ? c + 1 : c + N, rng() < 0.5 ? '=' : 'x']);
  }
  return { size: N, given, edges: es };
}

test('fixture 2026-11-09 matches LinkedIn solution', () => {
  const day = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', '2026-11-09.json'), 'utf8'));
  const s = solveTango(day.tango);
  assert.ok(s && checkTango(day.tango, s));
  assert.deepEqual(s, day.tango.solution);
  assert.equal(countTangoSolutions(day.tango), 1);
});

test('trivial sizes', () => {
  assert.deepEqual(solveTango({ size: 0, given: {}, edges: [] }), []);
  const s2 = solveTango({ size: 2, given: {}, edges: [] });
  assert.ok(s2 && checkTango({ size: 2, given: {}, edges: [] }, s2));
  assert.equal(countTangoSolutions({ size: 2, given: {}, edges: [] }, 10), 2);
  assert.equal(solveTango({ size: 3, given: {}, edges: [] }), null);
  assert.equal(solveTango({ size: 5, given: {}, edges: [] }), null);
});

test('empty grids have solutions (6..14)', () => {
  for (const size of [6, 8, 10, 12, 14]) {
    const p = { size, given: {}, edges: [] };
    const s = solveTango(p);
    assert.ok(s && checkTango(p, s), `size ${size}`);
  }
});

test('contradictory puzzles return null', () => {
  const cases: [string, TangoPuzzle][] = [
    ['three in a row', { size: 6, given: { 0: 0, 1: 0, 2: 0 }, edges: [] }],
    ['three in a column', { size: 6, given: { 1: 1, 7: 1, 13: 1 }, edges: [] }],
    ['too many in a row', { size: 6, given: { 0: 1, 2: 1, 4: 1, 5: 1 }, edges: [] }],
    ['too many in a column', { size: 4, given: { 0: 0, 4: 0, 12: 0 }, edges: [] }],
    ['x edge between equal givens', { size: 6, given: { 0: 0, 1: 0 }, edges: [[0, 1, 'x']] }],
    ['= edge between different givens', { size: 6, given: { 0: 0, 6: 1 }, edges: [[0, 6, '=']] }],
    ['= chain makes a triple', { size: 6, given: {}, edges: [[0, 1, '='], [1, 2, '=']] }],
    ['x self edge', { size: 6, given: {}, edges: [[3, 3, 'x']] }],
    ['inconsistent edge cycle', { size: 6, given: {}, edges: [[0, 1, 'x'], [1, 7, 'x'], [7, 6, 'x'], [6, 0, '=']] }],
    ['given out of range', { size: 4, given: { 16: 0 }, edges: [] }],
    ['given not 0/1', { size: 4, given: { 0: 2 }, edges: [] }],
    ['edge out of range', { size: 4, given: {}, edges: [[15, 16, '=']] }],
    // no clue clashes with another directly; only search proves it impossible (checked by brute force below)
    ['deep contradiction', {
      size: 6, given: { 11: 0, 15: 1, 26: 0 },
      edges: [[6, 7, '='], [33, 34, 'x'], [9, 10, '='], [4, 5, 'x']],
    }],
  ];
  for (const [name, p] of cases) {
    if (name === 'deep contradiction') assert.equal(bruteCount(p), 0);
    assert.equal(solveTango(p), null, name);
    assert.equal(countTangoSolutions(p), 0, name);
  }
});

test('edge-only puzzle is solved and respects edges', () => {
  const p: TangoPuzzle = { size: 6, given: {}, edges: [[0, 1, '='], [2, 3, 'x'], [0, 6, 'x'], [35, 34, '=']] };
  const s = solveTango(p);
  assert.ok(s && checkTango(p, s));
});

test('solution counts match brute force (4x4 and 6x6, random clues)', () => {
  const rng = mulberry32(42);
  for (let i = 0; i < 300; i++) {
    const N = i % 3 === 0 ? 6 : 4;
    const p = randomClues(N, rng, Math.floor(rng() * (N + 2)), Math.floor(rng() * (N + 2)));
    const want = bruteCount(p);
    assert.equal(countTangoSolutions(p, Infinity), want, JSON.stringify(p));
    const s = solveTango(p);
    if (want === 0) assert.equal(s, null, JSON.stringify(p));
    else assert.ok(s && checkTango(p, s), JSON.stringify(p));
  }
});

test('random generated puzzles (sizes 4..12) solve to the hidden solution', () => {
  const rng = mulberry32(7);
  for (const size of [4, 6, 8, 10, 12]) {
    for (const mode of ['unique', 'minimal', 'sparse'] as const) {
      const reps = mode === 'minimal' && size >= 10 ? 2 : 10;
      for (let i = 0; i < reps; i++) {
        const { puzzle, solution } = generateTango(size, rng, mode, 0.1);
        assert.ok(checkTango(puzzle, solution));
        const s = solveTango(puzzle);
        assert.ok(s && checkTango(puzzle, s), `${size} ${mode}`);
        if (mode !== 'sparse') {
          assert.deepEqual(s, solution, `${size} ${mode}`);
          assert.equal(countTangoSolutions(puzzle), 1);
        }
      }
    }
  }
});

test('solver does not mutate the puzzle', () => {
  const p: TangoPuzzle = { size: 6, given: { 0: 1, 7: 0 }, edges: [[2, 3, 'x']] };
  const copy = JSON.parse(JSON.stringify(p));
  solveTango(p);
  countTangoSolutions(p);
  assert.deepEqual(p, copy);
});

// ---------- input: simulated board (no browser) ----------

test('tangoTaps / tangoLearnFirst agree with the 3-state cycle', async () => {
  const { tangoTaps, tangoLearnFirst } = await import('../src/page/games.ts');
  for (const first of [0, 1] as const) {
    const cycle = [-1, first, first ^ 1];
    for (let i = 0; i < 3; i++) {
      assert.equal(tangoLearnFirst(cycle[i], cycle[(i + 1) % 3]), first);
      for (let j = 0; j < 3; j++) assert.equal(tangoTaps(first, cycle[i], cycle[j]), (j - i + 3) % 3);
    }
  }
  assert.equal(tangoLearnFirst(0, 0), null);
});

/**
 * Fake LinkedIn board. Clicks advance a cell along the cycle; the page re-renders in a
 * microtask (like React 18). With `stale`, a click handler rebuilds the whole board from
 * the last render, so clicks sent before a re-render overwrite each other.
 */
function fakeBoard(init: number[], first: 0 | 1, stale: boolean) {
  const g = globalThis as any;
  g.window ??= globalThis;
  g.MouseEvent ??= class extends Event {};
  g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(performance.now()), 1);
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  const order = [-1, first, first ^ 1];
  const next = (v: number) => order[(order.indexOf(v) + 1) % 3];
  let shown = init.slice();
  let queued: number[] | null = null;
  let clicks = 0;
  const cells = init.map((_, i) => {
    const el = new EventTarget() as any;
    el.dataset = { cellIdx: String(i) };
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 10, height: 10 });
    el.querySelector = (sel: string) =>
      (sel.includes('cell-one') && shown[i] === 1) || (sel.includes('cell-zero') && shown[i] === 0) ? {} : null;
    el.addEventListener('click', () => {
      clicks++;
      const base = stale ? shown.slice() : (queued ?? shown.slice());
      base[i] = next(base[i]);
      if (!queued) queueMicrotask(() => { shown = queued!; queued = null; });
      queued = base;
    });
    return el;
  });
  const grid = { isConnected: true, querySelectorAll: () => cells } as any;
  return { grid, shown: () => shown, clicks: () => clicks, store };
}

test('play reaches the solution for every cycle and render model', async () => {
  const { tango } = await import('../src/page/games.ts');
  const day = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', '2026-11-09.json'), 'utf8'));
  const p: TangoPuzzle = day.tango;
  const s = solveTango(p)!;
  for (const first of [0, 1] as const) {
    for (const stale of [false, true]) {
      const init = s.map((v, i) => (i in p.given ? v : -1));
      const b = fakeBoard(init, first, stale);
      await tango.play(b.grid, p, s, {});
      assert.deepEqual(b.shown(), s, `first=${first} stale=${stale}`);
      const learned = JSON.parse(b.store.get('lgs-tango-input')!);
      assert.equal(learned.first, first);
      assert.equal(learned.mode, stale ? 'yield' : 'burst');
      const minimal = s.reduce((n, v, i) => n + (i in p.given ? 0 : v === first ? 1 : 2), 0);
      if (!stale) assert.equal(b.clicks(), minimal, 'burst uses the exact number of taps');
      // second run on a scrambled board reuses what was learned
      const scrambled = s.map((v, i) => (i in p.given ? v : [-1, 0, 1][i % 3]));
      const b2 = fakeBoard(scrambled, first, stale);
      b2.store.set('lgs-tango-input', JSON.stringify(learned));
      await tango.play(b2.grid, p, s, {});
      assert.deepEqual(b2.shown(), s);
    }
  }
});

test('play recovers when the cached cycle is wrong', async () => {
  const { tango } = await import('../src/page/games.ts');
  const p: TangoPuzzle = { size: 4, given: {}, edges: [] };
  const s = solveTango(p)!;
  const b = fakeBoard(s.map(() => -1), 1, false);
  b.store.set('lgs-tango-input', JSON.stringify({ first: 0, mode: 'burst' }));
  await tango.play(b.grid, p, s, {});
  assert.deepEqual(b.shown(), s);
  assert.equal(JSON.parse(b.store.get('lgs-tango-input')!).first, null, 'bad cycle is forgotten');
});
