import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveQueens, checkQueens, countQueens, solveAllQueens, type QueensPuzzle } from '../src/solvers/queens.ts';
import { rng, randomPuzzle, randomUniquePuzzle, randomFreePuzzle } from '../scripts/bench-queens.ts';

/** Puzzle from rows of region letters. */
const parse = (rows: string[]): QueensPuzzle => ({
  size: rows.length,
  regions: rows.join('').split('').map((ch) => ch.charCodeAt(0)),
});

/** All solutions by plain enumeration (small N only). */
function bruteForce(p: QueensPuzzle): number[][] {
  const N = p.size, out: number[][] = [], cols: number[] = [];
  const go = (r: number) => {
    if (r === N) { if (checkQueens(p, cols)) out.push([...cols]); return; }
    for (let c = 0; c < N; c++) {
      if (cols.includes(c) || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      cols.push(c); go(r + 1); cols.pop();
    }
  };
  go(0);
  return out;
}

test('1x1', () => {
  assert.deepEqual(solveQueens({ size: 1, regions: [5] }), [0]);
});

test('2x2 and 3x3 have no solution', () => {
  assert.equal(solveQueens({ size: 2, regions: [0, 0, 1, 1] }), null);
  assert.equal(solveQueens(parse(['aab', 'acb', 'ccb'])), null);
});

test('4x4 with a unique solution', () => {
  // The two 4-queens-no-touch solutions are [1,3,0,2] and [2,0,3,1].
  const p = parse([
    'aaab',
    'abbb',
    'cddb',
    'ccdd',
  ]);
  assert.equal(countQueens(p), 1);
  const s = solveQueens(p);
  assert.ok(s && checkQueens(p, s));
  assert.deepEqual(s, [1, 3, 0, 2]);
});

test('arbitrary region ids', () => {
  const p = parse(['aaab', 'abbb', 'cddb', 'ccdd']);
  const ids = [1e6, -3, 42, 7];
  const remapped = { size: 4, regions: p.regions.map((x) => ids[x - 97]) };
  assert.deepEqual(solveQueens(remapped), [1, 3, 0, 2]);
});

test('malformed input returns null', () => {
  assert.equal(solveQueens({ size: 4, regions: [0, 1, 2, 3] }), null); // wrong length
  assert.equal(solveQueens({ size: 0, regions: [] }), null);
  // 3 regions on a 4x4 board: 4 queens cannot each have their own region.
  assert.equal(solveQueens(parse(['aaab', 'aaab', 'cccb', 'cccb'])), null);
  // 5 regions on a 4x4 board: some region would stay empty.
  assert.equal(solveQueens(parse(['abbb', 'aaab', 'cdad', 'cdde'])), null);
});

test('unsatisfiable: two regions confined to the same row', () => {
  const p = parse([
    'abcccc',
    'dddddd',
    'dddddd',
    'eeeeee',
    'ffffff',
    'ffffff',
  ]);
  assert.equal(solveQueens(p), null);
  assert.equal(countQueens(p), 0);
});

test('unsatisfiable: regions force touching queens', () => {
  // Regions a and b are single cells, diagonal neighbours.
  const p = parse([
    'accccc',
    'cbcccc',
    'cccccc',
    'dddddd',
    'eeeeee',
    'ffffff',
  ]);
  assert.equal(solveQueens(p), null);
});

test('fixture-style 7x7 puzzle', () => {
  const p = {
    size: 7,
    regions: [2, 3, 6, 1, 1, 1, 1, 2, 3, 6, 6, 1, 5, 1, 2, 3, 6, 6, 1, 1, 1, 2, 3, 3, 3, 3, 4, 1, 2, 2, 2, 3, 3, 4, 4, 2, 2, 2, 3, 3, 3, 3, 2, 0, 0, 0, 0, 0, 0],
  };
  const s = solveQueens(p);
  assert.ok(s && checkQueens(p, s));
  assert.equal(countQueens(p), 1);
});

test('checkQueens rejects bad answers', () => {
  const p = parse(['aaab', 'abbb', 'cddb', 'ccdd']);
  assert.ok(checkQueens(p, [1, 3, 0, 2]));
  assert.ok(!checkQueens(p, [1, 3, 0]));        // too short
  assert.ok(!checkQueens(p, [1, 3, 1, 2]));     // column twice
  assert.ok(!checkQueens(p, [2, 0, 3, 1]));     // region a twice
  assert.ok(!checkQueens(p, [0, 1, 2, 3]));     // touching
  assert.ok(!checkQueens(p, [1, 3, 0, 4]));     // off the board
});

test('agrees with brute force on random small boards (incl. unsolvable)', () => {
  const rand = rng(7);
  let unsat = 0, multi = 0;
  for (let i = 0; i < 400; i++) {
    const N = 4 + (i % 4); // 4..7
    const p = i % 2 ? randomFreePuzzle(N, rand) : randomPuzzle(N, rand).puzzle;
    const all = bruteForce(p);
    const s = solveQueens(p);
    if (all.length === 0) { unsat++; assert.equal(s, null, JSON.stringify(p)); }
    else assert.ok(s && checkQueens(p, s), JSON.stringify(p));
    if (all.length > 1) multi++;
    assert.equal(countQueens(p, 3), Math.min(3, all.length));
    // Enumerated solutions are distinct and valid.
    const found = solveAllQueens(p, 100);
    assert.equal(found.length, all.length);
    assert.equal(new Set(found.map(String)).size, found.length);
  }
  assert.ok(unsat > 20 && multi > 20, `coverage: ${unsat} unsat, ${multi} multi`);
});

test('random planted puzzles 7x7 to 15x15', () => {
  for (let N = 7; N <= 15; N++) {
    const rand = rng(100 + N);
    for (let i = 0; i < 40; i++) {
      const { puzzle } = randomPuzzle(N, rand);
      const s = solveQueens(puzzle);
      assert.ok(s && checkQueens(puzzle, s), `N=${N} #${i}`);
    }
  }
});

test('random unique puzzles: solver finds the planted answer', () => {
  for (let N = 7; N <= 11; N++) {
    const rand = rng(200 + N);
    for (let i = 0; i < 5; i++) {
      const { puzzle, solution } = randomUniquePuzzle(N, rand);
      assert.deepEqual(solveQueens(puzzle), solution);
      assert.equal(countQueens(puzzle), 1);
    }
  }
});

test('random free puzzles up to 15x15: valid answer or null, quickly', () => {
  for (let N = 8; N <= 15; N++) {
    const rand = rng(300 + N);
    for (let i = 0; i < 40; i++) {
      const p = randomFreePuzzle(N, rand);
      const t = performance.now();
      const s = solveQueens(p);
      assert.ok(performance.now() - t < 200, 'too slow');
      if (s) assert.ok(checkQueens(p, s));
    }
  }
});
