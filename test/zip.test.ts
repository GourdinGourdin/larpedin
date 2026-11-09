import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveZip, solveZipDetailed, checkZip, zipNeighbors, zipPruneTrace, type ZipPuzzle,
} from '../src/solvers/zip.ts';
import { randomZip, mulberry32 } from '../scripts/bench-zip.ts';
import { turnPoints } from '../src/page/dom.ts';

const solves = (p: ZipPuzzle) => {
  const path = solveZip(p);
  assert.ok(path, 'no solution');
  assert.ok(checkZip(p, path), 'invalid path');
  return path;
};

/** Exhaustive reference: does any valid path exist? (small grids only) */
function bruteForce(p: ZipPuzzle): boolean {
  const n = p.rows * p.cols;
  const adj = zipNeighbors(p);
  const K = Object.keys(p.numbers).length;
  const seq = new Int32Array(n).fill(-1);
  let start = -1;
  for (const [c, s] of Object.entries(p.numbers)) { seq[+c] = s; if (s === 0) start = +c; }
  if (start < 0) return false;
  const seen = new Uint8Array(n);
  const go = (c: number, depth: number, next: number): boolean => {
    if (depth === n) return next === K;
    for (const o of adj[c]) {
      if (seen[o] || (seq[o] >= 0 && seq[o] !== next)) continue;
      if (seq[o] === K - 1 && depth + 1 !== n) continue; // the last number ends the path
      seen[o] = 1;
      if (go(o, depth + 1, seq[o] >= 0 ? next + 1 : next)) return true;
      seen[o] = 0;
    }
    return false;
  };
  seen[start] = 1;
  return go(start, 1, 1);
}

test('zip: single cell', () => {
  assert.deepEqual(solveZip({ rows: 1, cols: 1, numbers: { 0: 0 }, walls: [] }), [0]);
});

test('zip: 1xN and Nx1 strips', () => {
  assert.deepEqual(solveZip({ rows: 1, cols: 5, numbers: { 0: 0, 4: 1 }, walls: [] }), [0, 1, 2, 3, 4]);
  assert.deepEqual(solveZip({ rows: 4, cols: 1, numbers: { 3: 0, 0: 1 }, walls: [] }), [3, 2, 1, 0]);
  assert.equal(solveZip({ rows: 1, cols: 5, numbers: { 1: 0, 4: 1 }, walls: [] }), null);
});

test('zip: only start and end numbers', () => {
  for (const [rows, cols] of [[2, 2], [3, 3], [4, 6], [5, 5], [7, 7], [8, 8], [9, 9], [10, 10]]) {
    const p: ZipPuzzle = { rows, cols, numbers: { 0: 0, [rows * cols - 1]: 1 }, walls: [] };
    // corner to opposite corner needs both corners on the majority colour
    const expect = (rows * cols) % 2 === 1;
    const path = solveZip(p);
    if (expect) assert.ok(path && checkZip(p, path), `${rows}x${cols}`);
    else assert.equal(path, null, `${rows}x${cols} has no corner-to-corner path`);
  }
  const p: ZipPuzzle = { rows: 8, cols: 8, numbers: { 0: 0, 7: 1 }, walls: [] };
  solves(p);
});

test('zip: non-square grids', () => {
  solves({ rows: 3, cols: 7, numbers: { 0: 0, 10: 1, 20: 2 }, walls: [] });
  const rand = mulberry32(42);
  for (const [R, C] of [[2, 9], [5, 8], [7, 9], [9, 6], [3, 12]]) {
    for (let i = 0; i < 20; i++) solves(randomZip(R, C, 5, 4, rand).puzzle);
  }
});

test('zip: walls are honoured both ways and edge walls are ignored', () => {
  const p: ZipPuzzle = {
    rows: 2, cols: 3, numbers: { 0: 0, 3: 1 },
    walls: [[0, 'RIGHT'], [4, 'UP'], [2, 'RIGHT'], [0, 'UP'], [5, 'DOWN']],
  };
  const adj = zipNeighbors(p);
  assert.deepEqual(adj[0], [3]);
  assert.ok(!adj[1].includes(0) && !adj[1].includes(4));
  // 0's only exit is the end
  assert.equal(solveZip(p), null);
  const q: ZipPuzzle = { rows: 2, cols: 3, numbers: { 3: 0, 0: 1 }, walls: [[1, 'DOWN']] };
  assert.deepEqual(solveZip(q), [3, 4, 5, 2, 1, 0]);
});

test('zip: invalid input returns null with status invalid', () => {
  const bad: ZipPuzzle[] = [
    { rows: 3, cols: 3, numbers: {}, walls: [] },
    { rows: 3, cols: 3, numbers: { 0: 0, 4: 2 }, walls: [] }, // gap in numbering
    { rows: 3, cols: 3, numbers: { 0: 1, 4: 2 }, walls: [] }, // no start
    { rows: 3, cols: 3, numbers: { 0: 0, 99: 1 }, walls: [] }, // cell out of range
    { rows: 0, cols: 3, numbers: { 0: 0 }, walls: [] },
  ];
  for (const p of bad) {
    const r = solveZipDetailed(p);
    assert.equal(r.status, 'invalid', JSON.stringify(p));
    assert.equal(r.path, null);
  }
  assert.equal(solveZipDetailed({ rows: 2, cols: 2, numbers: { 0: 0 }, walls: [] }).status, 'unsolvable');
});

test('zip: agrees with brute force on small puzzles (solvable and not)', () => {
  const rand = mulberry32(7);
  let solvable = 0, unsolvable = 0;
  for (let i = 0; i < 400; i++) {
    const R = 2 + Math.floor(rand() * 3), C = 2 + Math.floor(rand() * 3); // 2..4 x 2..4
    const n = R * C;
    const k = 2 + Math.floor(rand() * Math.min(4, n - 1));
    const cells = new Set<number>();
    while (cells.size < k) cells.add(Math.floor(rand() * n));
    const numbers: Record<number, number> = {};
    [...cells].forEach((c, s) => (numbers[c] = s));
    const walls: ZipPuzzle['walls'] = [];
    for (let w = Math.floor(rand() * 3); w > 0; w--) {
      walls.push([Math.floor(rand() * n), rand() < 0.5 ? 'RIGHT' : 'DOWN']);
    }
    const p = { rows: R, cols: C, numbers, walls };
    const expect = bruteForce(p);
    const r = solveZipDetailed(p);
    assert.equal(r.status, expect ? 'solved' : 'unsolvable', JSON.stringify(p));
    if (expect) { solvable++; assert.ok(checkZip(p, r.path!)); } else unsolvable++;
  }
  assert.ok(solvable > 20 && unsolvable > 20, `coverage ${solvable}/${unsolvable}`);
});

test('zip: pruning never rejects a known solution', () => {
  const rand = mulberry32(3);
  for (const [R, C, k, w] of [[5, 5, 3, 2], [6, 6, 6, 4], [7, 7, 3, 0], [8, 8, 8, 6], [9, 9, 10, 8], [10, 10, 12, 10], [4, 9, 4, 3], [6, 6, 36, 0]]) {
    for (let i = 0; i < 25; i++) {
      const { puzzle, solution } = randomZip(R, C, k, w, rand);
      assert.equal(zipPruneTrace(puzzle, solution), -1, JSON.stringify({ puzzle, solution }));
    }
  }
});

test('zip: random puzzles are solved and verified', () => {
  const rand = mulberry32(2026);
  for (const [R, C, k, w, count] of [[6, 6, 6, 4, 40], [7, 7, 3, 0, 40], [8, 8, 3, 0, 40], [8, 8, 8, 6, 40], [9, 9, 10, 8, 25], [10, 10, 12, 10, 15]]) {
    for (let i = 0; i < count; i++) {
      const { puzzle } = randomZip(R, C, k, w, rand);
      const r = solveZipDetailed(puzzle, { timeoutMs: 10_000 });
      assert.equal(r.status, 'solved', JSON.stringify(puzzle));
      assert.ok(checkZip(puzzle, r.path!));
    }
  }
});

test('zip: budget aborts and reports status', () => {
  const { puzzle } = randomZip(10, 10, 12, 10, mulberry32(9));
  const capped = solveZipDetailed(puzzle, { maxNodes: 1 });
  assert.equal(capped.status, 'aborted');
  assert.equal(capped.path, null);
  const full = solveZipDetailed(puzzle, { timeoutMs: 10_000 });
  assert.equal(full.status, 'solved');
  assert.ok(checkZip(puzzle, full.path!));
});

test('zip: drag turn points', () => {
  // 3x3 serpentine 0 1 2 5 4 3 6 7 8: turns at positions 2, 3, 5, 6, end 8
  assert.deepEqual(turnPoints([0, 1, 2, 5, 4, 3, 6, 7, 8]), [2, 3, 5, 6, 8]);
  assert.deepEqual(turnPoints([4]), []);
  assert.deepEqual(turnPoints([0, 1, 2, 3]), [3]);
});
