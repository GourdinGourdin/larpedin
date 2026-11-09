import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  solveWend, solveAllWend, checkWend, wendWords, wendCandidates, generateWend, type WendPuzzle, type WendDict,
} from '../src/solvers/wend.ts';
import { wendDict, decodeWendWords } from '../src/data/wend-dict.ts';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dict = wendDict();
/** Order-free identity of an answer (equal-length words may come in any order). */
const answerKey = (ps: number[][]) => ps.map((x) => x.join()).sort().join('|');
const dir = join(import.meta.dirname, '..', 'fixtures');

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const day = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  if (!day.wend) continue;
  test(`${file} wend: solves to LinkedIn's answer`, () => {
    const p: WendPuzzle = day.wend;
    const t = performance.now();
    const s = solveWend(p, dict);
    const ms = performance.now() - t;
    assert.ok(s, 'no solution');
    assert.ok(checkWend(p, s, dict), 'invalid answer');
    if (day.wend.solution) {
      assert.deepEqual(s, day.wend.solution);
      assert.ok(checkWend(p, day.wend.solution, dict), "LinkedIn's answer should check");
    }
    console.log(`  wend ${p.rows}x${p.cols} ${wendWords(p, s).join(' ')} in ${ms.toFixed(2)} ms`);
  });
}

test('dictionary: decodes, sorted blocks, A-Z 3..12, common words ranked first', () => {
  assert.ok(dict.words.length > 200_000);
  assert.equal(dict.words.length, dict.ranks!.length);
  assert.ok(dict.words.every((w) => /^[A-Z]{3,12}$/.test(w)));
  const rank = new Map(dict.words.map((w, i) => [w, dict.ranks![i]]));
  for (const w of ['ZAP', 'TREND', 'ACCEPT', 'RECEIPT']) assert.ok(rank.has(w), w);
  assert.ok(rank.get('ACCEPT')! < rank.get('ZAP')!);
  const small = decodeWendWords('0cat2r1og\n0zoo');
  assert.deepEqual(small.words, ['CAT', 'CAR', 'COG', 'ZOO']);
  assert.deepEqual(small.ranks, [0, 0, 0, 1]);
});

const tiny: WendDict = { words: ['CAT', 'DOG', 'ACT', 'TAC', 'GOD'], ranks: [0, 0, 1, 3, 2] };

test('edge: reads a word from its first cell, any orthogonal snake', () => {
  // C A G     CAT bends down; the right column reads GOD down or DOG up
  // . T O
  // . . D
  const p: WendPuzzle = { rows: 3, cols: 3, letters: ['C', 'A', 'G', '', 'T', 'O', '', '', 'D'], lengths: [3, 3] };
  const s = solveWend(p, tiny);
  assert.ok(s && checkWend(p, s, tiny));
  assert.deepEqual(s, [[0, 1, 4], [8, 5, 2]]); // CAT, DOG (DOG is more common than GOD)
  const all = solveAllWend(p, tiny);
  assert.equal(all.length, 4); // CAT|TAC x DOG|GOD
  for (const c of all) assert.ok(checkWend(p, c.paths, tiny));
});

test('edge: commonness ranking picks the common reading', () => {
  // A row "C A T" and "G O D" -> CAT (rank 0) beats TAC (rank 3), DOG (0) beats GOD (2)
  const p: WendPuzzle = { rows: 2, cols: 3, letters: ['C', 'A', 'T', 'D', 'O', 'G'], lengths: [3, 3] };
  const all = solveAllWend(p, tiny);
  // (ACT would need C next to T: not possible here)
  assert.deepEqual(all.map((c) => c.words.slice().sort().join()).sort(),
    ['CAT,DOG', 'CAT,GOD', 'DOG,TAC', 'GOD,TAC']);
  assert.deepEqual(wendWords(p, solveWend(p, tiny)!).sort(), ['CAT', 'DOG']);
  assert.equal(all[0].cost, Math.min(...all.map((c) => c.cost)));
});

test('edge: paths follow the order of lengths', () => {
  const d: WendDict = { words: ['AB', 'CDE'] };
  const p: WendPuzzle = { rows: 1, cols: 5, letters: ['C', 'D', 'E', 'A', 'B'], lengths: [3, 2] };
  assert.deepEqual(solveWend(p, d), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(solveWend({ ...p, lengths: [2, 3] }, d), [[3, 4], [0, 1, 2]]);
});

test('edge: no answer -> null; bad input -> null', () => {
  const p: WendPuzzle = { rows: 2, cols: 3, letters: ['C', 'A', 'T', 'D', 'O', 'G'], lengths: [3, 3] };
  assert.equal(solveWend(p, { words: ['CAT'] }), null); // unknown word
  assert.equal(solveWend({ ...p, lengths: [3, 2] }, tiny), null); // lengths don't add up
  assert.equal(solveWend({ ...p, lengths: [6] }, tiny), null);
  assert.equal(solveWend({ ...p, letters: p.letters.slice(1) }, tiny), null); // wrong size
  assert.equal(solveWend({ ...p, lengths: [] }, tiny), null);
  // letters must not be reused, holes must not be crossed
  const q: WendPuzzle = { rows: 1, cols: 7, letters: ['C', 'A', 'T', '', 'D', 'O', 'G'], lengths: [3, 3] };
  assert.deepEqual(solveWend(q, tiny), [[0, 1, 2], [4, 5, 6]]);
  const r: WendPuzzle = { rows: 1, cols: 4, letters: ['C', 'A', '', 'T'], lengths: [3] };
  assert.equal(solveWend(r, tiny), null);
});

test('edge: lower-case / accented tiles are normalised', () => {
  const p: WendPuzzle = { rows: 1, cols: 3, letters: ['c', 'á', 't'], lengths: [3] };
  assert.deepEqual(solveWend(p, tiny), [[0, 1, 2]]);
});

test('checkWend rejects bad answers', () => {
  const p: WendPuzzle = { rows: 2, cols: 3, letters: ['C', 'A', 'T', 'D', 'O', 'G'], lengths: [3, 3] };
  assert.ok(checkWend(p, [[0, 1, 2], [3, 4, 5]], tiny));
  assert.ok(!checkWend(p, [[0, 1, 2], [3, 4, 5]], { words: ['CAT'] })); // DOG not in dict
  assert.ok(!checkWend(p, [[0, 1, 2]]));                // missing word
  assert.ok(!checkWend(p, [[0, 1, 2], [3, 5, 4]]));     // 3 -> 5 not adjacent
  assert.ok(!checkWend(p, [[0, 1, 2], [2, 4, 5]]));     // reused cell
  assert.ok(!checkWend(p, [[0, 1, 2, 5], [3, 4]]));     // lengths 4,2 vs 3,3
  assert.ok(!checkWend(p, [[0, 1, 2], [3, 4, 9]]));     // off grid
  assert.ok(!checkWend(p, null));
  const h: WendPuzzle = { rows: 1, cols: 4, letters: ['C', 'A', 'T', ''], lengths: [4] };
  assert.ok(!checkWend(h, [[0, 1, 2, 3]]));             // through a hole
});

test('candidates only spell words of needed lengths', () => {
  const p: WendPuzzle = { rows: 2, cols: 3, letters: ['C', 'A', 'T', 'D', 'O', 'G'], lengths: [3, 3] };
  const c = wendCandidates(p, tiny);
  for (const k of c) assert.equal(wendWords(p, [k.path])[0], k.word);
  assert.deepEqual(c.map((k) => k.word).sort(), ['CAT', 'DOG', 'GOD', 'TAC']);
});

test('random generated puzzles (bundled dictionary) are solved and checked', () => {
  const rng = mulberry32(42);
  let n = 0, planted = 0;
  for (const size of [4, 5, 6, 7]) {
    for (let i = 0; i < 25; i++) {
      const k = size - 1;
      let lengths: number[];
      do lengths = Array.from({ length: k }, () => 3 + Math.floor(rng() * 6));
      while (lengths.reduce((a, b) => a + b, 0) > 0.9 * size * size || lengths.reduce((a, b) => a + b, 0) < 0.6 * size * size);
      const g = generateWend(size, size, lengths, rng, dict, 3);
      if (!g) continue;
      assert.ok(checkWend(g.puzzle, g.solution, dict), 'generator made an invalid puzzle');
      const s = solveWend(g.puzzle, dict);
      assert.ok(s, `no solution for ${JSON.stringify(g.puzzle)}`);
      assert.ok(checkWend(g.puzzle, s, dict), `invalid answer for ${JSON.stringify(g.puzzle)}`);
      assert.deepEqual(s.map((x) => wendWords(g.puzzle, [x])[0].length), lengths);
      // the planted answer is among all covers
      const all = solveAllWend(g.puzzle, dict, { maxCovers: 100_000 });
      assert.ok(all.some((c) => answerKey(c.paths) === answerKey(g.solution)) || all.length >= 100_000);
      if (answerKey(s) === answerKey(g.solution)) planted++;
      n++;
    }
  }
  assert.ok(n >= 80, `only ${n} puzzles generated`);
  console.log(`  ${n} random puzzles, planted answer returned for ${planted}`);
});
