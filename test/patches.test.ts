import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  solvePatches, checkPatches, parseShape,
  type PatchesPuzzle, type PatchShape, type Rect,
} from '../src/solvers/patches.ts';
import { generatePatches, rng } from '../scripts/bench-patches.ts';
import { patchesDragPath } from '../src/page/games.ts';

const P = (rows: number, cols: number, clues: [number, PatchShape, number?][]): PatchesPuzzle =>
  ({ rows, cols, clues: clues.map(([cell, shape, size = 0]) => ({ cell, shape, size })) });

const solved = (p: PatchesPuzzle) => {
  const r = solvePatches(p);
  assert.ok(r, 'expected a solution');
  assert.ok(checkPatches(p, r), `invalid solution ${JSON.stringify(r)}`);
  return r;
};

/** Independent brute force: the first free cell is the top-left of its rectangle. */
function bruteSolvable(p: PatchesPuzzle): boolean {
  const { rows, cols, clues } = p;
  const clueAt = new Map(clues.map((c, i) => [c.cell, i]));
  if (clueAt.size !== clues.length) return false;
  const used = new Array(rows * cols).fill(false);
  const ok = (s: PatchShape, h: number, w: number) =>
    s === 'SQUARE' ? h === w : s === 'VERTICAL' ? h > w : s === 'HORIZONTAL' ? w > h : true;
  const rec = (): boolean => {
    const c = used.indexOf(false);
    if (c < 0) return true;
    const t = Math.floor(c / cols), l = c % cols;
    for (let h = 1; t + h <= rows; h++)
      for (let w = 1; l + w <= cols; w++) {
        let free = true, clue = -1, count = 0;
        for (let y = t; y < t + h && free; y++)
          for (let x = l; x < l + w; x++) {
            if (used[y * cols + x]) { free = false; break; }
            const ci = clueAt.get(y * cols + x);
            if (ci !== undefined) { clue = ci; count++; }
          }
        if (!free) break; // wider is blocked too
        if (count !== 1) continue;
        const { shape, size } = clues[clue];
        if (!ok(shape, h, w) || (size && size !== h * w)) continue;
        for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) used[y * cols + x] = true;
        if (rec()) return true;
        for (let y = t; y < t + h; y++) for (let x = l; x < l + w; x++) used[y * cols + x] = false;
      }
    return false;
  };
  return rec();
}

test('parseShape is tolerant', () => {
  assert.equal(parseShape('PatchesShapeConstraint_SQUARE'), 'SQUARE');
  assert.equal(parseShape('PatchesShapeConstraint_VERTICAL_RECT'), 'VERTICAL');
  assert.equal(parseShape('PatchesShapeConstraint_HORIZONTAL_RECT'), 'HORIZONTAL');
  assert.equal(parseShape('PatchesShapeConstraint_WIDE_RECT'), 'HORIZONTAL');
  assert.equal(parseShape('tall'), 'VERTICAL');
  assert.equal(parseShape('PatchesShapeConstraint_ANY'), 'ANY');
  assert.equal(parseShape('PatchesShapeConstraint_UNKNOWN'), 'ANY');
  assert.equal(parseShape(undefined), 'ANY');
  assert.equal(parseShape(3), 'ANY');
});

test('fixtures', () => {
  const dir = join(import.meta.dirname, '..', 'fixtures');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const day = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!day.patches) continue;
    solved({
      rows: day.patches.rows, cols: day.patches.cols,
      clues: day.patches.clues.map(([cell, shape, size]: [number, string, number]) =>
        ({ cell, shape: parseShape(shape), size })),
    });
  }
});

test('tiny grids', () => {
  assert.deepEqual(solved(P(1, 1, [[0, 'SQUARE']])), [[0, 0, 1, 1]]);
  assert.deepEqual(solved(P(1, 1, [[0, 'ANY', 1]])), [[0, 0, 1, 1]]);
  assert.equal(solvePatches(P(1, 1, [[0, 'VERTICAL']])), null);
  assert.deepEqual(solved(P(1, 5, [[3, 'HORIZONTAL']])), [[0, 0, 1, 5]]);
  assert.deepEqual(solved(P(4, 1, [[0, 'VERTICAL', 4]])), [[0, 0, 4, 1]]);
  assert.deepEqual(solved(P(3, 3, [[4, 'SQUARE']])), [[0, 0, 3, 3]]);
  // rectangular grid, two forced halves
  assert.deepEqual(solved(P(2, 4, [[0, 'SQUARE', 4], [7, 'SQUARE']])), [[0, 0, 2, 2], [0, 2, 2, 2]]);
});

test('unsolvable puzzles return null', () => {
  assert.equal(solvePatches(P(3, 3, [])), null, 'no clues');
  assert.equal(solvePatches(P(2, 2, [[0, 'SQUARE'], [3, 'SQUARE']])), null, '1x1 squares leave holes');
  assert.equal(solvePatches(P(2, 2, [[0, 'ANY', 5]])), null, 'area larger than grid');
  assert.equal(solvePatches(P(2, 3, [[0, 'ANY', 3], [5, 'ANY', 4]])), null, 'areas sum past grid');
  assert.equal(solvePatches(P(2, 3, [[0, 'ANY', 2], [5, 'ANY', 2]])), null, 'areas sum short of grid');
  assert.equal(solvePatches(P(3, 3, [[4, 'VERTICAL', 9]])), null, '3x3 is not tall');
  assert.equal(solvePatches(P(2, 2, [[0, 'ANY'], [0, 'ANY']])), null, 'duplicate clue cell');
  assert.equal(solvePatches(P(2, 2, [[4, 'ANY']])), null, 'clue outside grid');
  assert.equal(solvePatches(P(0, 3, [])), null, 'empty grid');
  // middle cell of a 1x3 row can only be reached by a clue whose rect would
  // swallow the other clue
  assert.equal(solvePatches(P(1, 3, [[0, 'SQUARE'], [2, 'SQUARE']])), null);
});

test('checkPatches rejects bad answers', () => {
  const p = P(2, 2, [[0, 'HORIZONTAL'], [2, 'HORIZONTAL']]);
  const good: Rect[] = [[0, 0, 1, 2], [1, 0, 1, 2]];
  assert.ok(checkPatches(p, good));
  assert.ok(!checkPatches(p, null));
  assert.ok(!checkPatches(p, [good[0]]), 'missing rect');
  assert.ok(!checkPatches(p, [good[1], good[0]]), 'clue order swapped');
  assert.ok(!checkPatches(p, [[0, 0, 2, 2], good[1]]), 'overlap');
  assert.ok(!checkPatches(p, [[0, 0, 1, 1], [1, 0, 1, 2]]), 'hole + wrong shape');
  assert.ok(!checkPatches(p, [[0, 0, 1, 3], [1, 0, 1, 2]]), 'out of bounds');
});

test('random generated puzzles 6x6..12x12 and 15x15 solve and check', () => {
  const rand = rng(12345);
  for (let size = 6; size <= 15; size++) {
    if (size === 13 || size === 14) continue;
    for (let i = 0; i < (size === 15 ? 10 : 40); i++) {
      const { puzzle } = generatePatches(size, size, rand);
      solved(puzzle);
    }
  }
});

test('random rectangular and loosely clued puzzles', () => {
  const rand = rng(777);
  for (let i = 0; i < 150; i++) {
    const rows = 3 + Math.floor(rand() * 10), cols = 3 + Math.floor(rand() * 10);
    const { puzzle } = generatePatches(rows, cols, rand, { pAny: 0.7, pSize: 0.1 });
    solved(puzzle);
  }
});

test('agrees with brute force on small random (mostly unsolvable) puzzles', () => {
  const rand = rng(4242);
  const shapes: PatchShape[] = ['SQUARE', 'VERTICAL', 'HORIZONTAL', 'ANY'];
  let yes = 0, no = 0;
  for (let i = 0; i < 1500; i++) {
    const rows = 1 + Math.floor(rand() * 5), cols = 1 + Math.floor(rand() * 5), n = rows * cols;
    let p: PatchesPuzzle;
    if (i % 3 === 0) {
      p = generatePatches(rows, cols, rand, { maxSide: 4, maxArea: 8 }).puzzle;
      // perturb some clues so the puzzle may break
      for (const c of p.clues) if (rand() < 0.2) c.shape = shapes[Math.floor(rand() * 4)];
    } else {
      const k = 1 + Math.floor(rand() * Math.max(1, n / 3));
      const cells = new Set<number>();
      while (cells.size < k) cells.add(Math.floor(rand() * n));
      p = {
        rows, cols, clues: [...cells].map((cell) => ({
          cell, shape: shapes[Math.floor(rand() * 4)], size: rand() < 0.5 ? 1 + Math.floor(rand() * 6) : 0,
        })),
      };
    }
    const expect = bruteSolvable(p);
    const got = solvePatches(p);
    if (expect) { yes++; assert.ok(got && checkPatches(p, got), JSON.stringify(p)); }
    else { no++; assert.equal(got, null, JSON.stringify(p)); }
  }
  assert.ok(yes > 100 && no > 100, `coverage: ${yes} solvable, ${no} unsolvable`);
});

test('node budget aborts and reports', () => {
  const { puzzle } = generatePatches(15, 15, rng(9), { pAny: 0.8, pSize: 0 });
  const stats = { nodes: 0, candidates: 0, aborted: false };
  assert.equal(solvePatches(puzzle, { maxNodes: 1, stats }), null);
  assert.ok(stats.aborted);
  solved(puzzle);
});

test('drag path: nearest corner to the clue, cell by cell, inside the rect', () => {
  const cols = 8;
  const cases: [Rect, number, number, number][] = [
    // rect, clue cell, expected start, expected end
    [[0, 0, 1, 1], 0, 0, 0],
    [[1, 1, 3, 2], 1 * cols + 1, 1 * cols + 1, 3 * cols + 2], // clue top-left
    [[1, 1, 3, 2], 3 * cols + 2, 3 * cols + 2, 1 * cols + 1], // clue bottom-right
    [[2, 2, 2, 5], 3 * cols + 6, 3 * cols + 6, 2 * cols + 2], // clue bottom-right-ish
    [[0, 0, 5, 5], 1 * cols + 3, 0 * cols + 4, 4 * cols + 0], // clue near top-right
  ];
  for (const [rect, clue, start, end] of cases) {
    const path = patchesDragPath(rect, clue, cols);
    assert.equal(path[0], start, `start for ${rect}`);
    assert.equal(path[path.length - 1], end, `end for ${rect}`);
    const [t, l, h, w] = rect;
    assert.equal(path.length, Math.max(h, w));
    for (let i = 0; i < path.length; i++) {
      const y = Math.floor(path[i] / cols), x = path[i] % cols;
      assert.ok(y >= t && y < t + h && x >= l && x < l + w, 'inside');
      if (i) {
        const py = Math.floor(path[i - 1] / cols), px = path[i - 1] % cols;
        assert.ok(Math.abs(y - py) <= 1 && Math.abs(x - px) <= 1 && path[i] !== path[i - 1], 'adjacent step');
      }
    }
  }
});
