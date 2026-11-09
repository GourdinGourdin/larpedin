# LinkedIn Games Solver (personal challenge)

Reads, solves and plays LinkedIn's **Zip**, **Queens**, **Tango** and **Patches** inside the page.

## How it works

1. **Read:** every game is a React grid (`[data-testid="interactive-grid"]`). Each cell's
   component props hold the puzzle data, so reading is exact and takes about 0 ms:
   - Zip: `gridSize`, `sequenceNo` per cell (0-based, -1 = none), `walls` `[{cellIdx, direction}]`
   - Queens: `cellMeta.color` (region id)
   - Tango: `cellData.state` / `isLocked`, `edges` `[{startIdx, endIdx, isEqual}]`
   - Patches: `clueCells` `[{cellIdx, shapeConstraint, numberConstraint}]`, `gridRows`/`gridCols`
2. **Solve:** exact search solvers in `src/solvers/`. These are not ML, because the solvers are always
   correct and take milliseconds.
3. **Play:** synthetic mouse events on the grid. The handlers don't check `isTrusted`.
   - Zip: one drag along the path. A fallback mode focuses each cell and presses Enter.
   - Queens and Tango: tap cells until the right symbol shows.
   - Patches: drag corner to corner for each rectangle.

## Install (Chrome)

```bash
npm install && npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/extension`.
Or install `dist/linkedin-games-solver.user.js` in Tampermonkey.

A small panel appears bottom-left on `/games/*`. It has a **Solve** button (or **Alt+S**), an **auto**
checkbox that solves as soon as an unsolved board appears, a Zip input mode selector, and **Export**,
which downloads every puzzle seen so far as JSON.

## Dev

```bash
npm test            # solve every puzzle in fixtures/
npm run bench       # Zip stress test: node scripts/bench-zip.ts <size> <count> <numbers> <walls>
npm run typecheck
```

Add exported puzzles to `fixtures/` (same shape as `fixtures/2026-11-09.json`) to grow the test set.

## Status

| | Read | Solve | Play on LinkedIn |
|---|---|---|---|
| Zip | checked on the live page | 6×6 about 1 ms, 8×8 median under 1 ms; random 10×10 can take seconds | **untested** (needs an unsolved puzzle) |
| Queens | checked | under 1 ms | **untested** |
| Tango | checked | matches LinkedIn's own solution | **untested** |
| Patches | checked | under 1 ms | **untested** |
