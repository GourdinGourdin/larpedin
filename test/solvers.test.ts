import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { solveZip, checkZip } from '../src/solvers/zip.ts';
import { solveQueens, checkQueens } from '../src/solvers/queens.ts';
import { solveTango, checkTango } from '../src/solvers/tango.ts';
import { solvePatches, checkPatches, parseShape } from '../src/solvers/patches.ts';

const dir = join(import.meta.dirname, '..', 'fixtures');
const days = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

for (const file of days) {
  const day = JSON.parse(readFileSync(join(dir, file), 'utf8'));

  if (day.zip) test(`${file} zip`, () => {
    const t = performance.now();
    const path = solveZip(day.zip);
    const ms = performance.now() - t;
    assert.ok(path, 'no solution');
    assert.ok(checkZip(day.zip, path), 'invalid path');
    console.log(`  zip ${day.zip.rows}x${day.zip.cols} solved in ${ms.toFixed(2)} ms`);
  });

  if (day.queens) test(`${file} queens`, () => {
    const cols = solveQueens(day.queens);
    assert.ok(cols && checkQueens(day.queens, cols));
  });

  if (day.tango) test(`${file} tango`, () => {
    const s = solveTango(day.tango);
    assert.ok(s && checkTango(day.tango, s));
    if (day.tango.solution) assert.deepEqual(s, day.tango.solution);
  });

  if (day.patches) test(`${file} patches`, () => {
    const pz = {
      rows: day.patches.rows,
      cols: day.patches.cols,
      clues: day.patches.clues.map(([cell, shape, size]: [number, string, number]) => ({
        cell, shape: parseShape(shape), size,
      })),
    };
    const rects = solvePatches(pz);
    assert.ok(rects && checkPatches(pz, rects));
  });
}
