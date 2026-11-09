# Linkedin Larp

Reads, solves and plays LinkedIn's daily puzzles (**Zip**, **Queens**, **Tango**, **Patches**, and **Wend** as it lands) inside the page.

> Linkedin Larp is an independent fan project. It is **not affiliated with, endorsed by or connected to LinkedIn**.

![The panel after solving Queens](docs/screenshots/panel-done.png)

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

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick `dist/extension`
(or upload `dist/linkedin-larp-<version>.zip`). A welcome page opens with a short guide and the settings.
Reload any LinkedIn tab that was already open. Or install `dist/linkedin-larp.user.js` in Tampermonkey
(panel only: no toolbar popup, settings stay in that site's localStorage).

## Usage

- **Panel.** On any `/games/*` page a small card appears bottom-left. Press **Solve** or **Alt+S**. It shows
  each stage (read, solve, play) and, when done, how long each took. On failure it says which stage failed
  and offers **Copy debug info** (JSON with the error, page, settings and the puzzle as read).
- Drag the card by its header; the position is remembered. **–** (or Esc) folds it into a pill; click the pill to open it.
- **Auto-solve** solves as soon as an unsolved board appears.
- The gear opens per-game settings (Zip input and drag path, Patches pace) and **Export puzzles**, which
  downloads every puzzle seen so far as JSON.
- **Toolbar popup:** status of the current tab, **Solve now**, links to each game, auto-solve and the shortcut.
  Settings sync between the popup, the welcome/options page and every LinkedIn tab.
- **Shortcut:** Alt+S (change it at `chrome://extensions/shortcuts`; the page also listens for Alt+S itself).

Everything runs in the browser: no account, no server, no analytics. Permissions: `storage` only, plus
content scripts on `https://www.linkedin.com/*`.

### How the pieces fit

| File | Runs in | Job |
|---|---|---|
| `src/page/main.ts` → `content.js` | page (MAIN world) | read / solve / play, draws the panel |
| `src/page/panel.ts` | page | the floating card, in a Shadow DOM so LinkedIn CSS can't touch it |
| `src/page/bridge.ts` → `bridge.js` | ISOLATED content script | relays settings (`chrome.storage.sync`) and status between page and extension via `postMessage` |
| `src/extension/background.ts` | service worker | opens the welcome page on install, relays the shortcut |
| `src/extension/popup.*`, `welcome.*` | extension pages | popup and welcome/options page |
| `src/page/theme.ts` | anywhere | the palette (base colours + one accent per game) and the logo SVG, for the website and video too |

Screenshots for the website: `npm run screenshots` (headless Chromium on local mock pages, writes
`docs/screenshots/`). Icons: `npm run icons` renders `src/extension/icons/` from the SVG in `theme.ts`.

## Dev

```bash
npm test            # solve every puzzle in fixtures/
npm run bench       # Zip stress test: node scripts/bench-zip.ts <size> <count> <numbers> <walls>
npm run typecheck
```

Add exported puzzles to `fixtures/` (same shape as `fixtures/2026-11-09.json`) to grow the test set.

## Status

Benchmarks on seeded random puzzles (`npm run bench`, `bench:queens`, `bench:tango`, `bench:patches`):

| | Read | Solve (median / worst) | Play on LinkedIn |
|---|---|---|---|
| Zip | checked on the live page | 8×8: 0.16 / 5 ms · 10×10: 0.7 / 34 ms | **untested** |
| Queens | checked | 7–11 (one answer): 0.01 / 0.05 ms | **untested** |
| Tango | checked; matches LinkedIn's own solution | 6×6: 0.01 / 0.04 ms | **untested** |
| Patches | checked | 6–9: 0.03 / 0.6 ms | **untested** |

To check a game in play: open a fresh puzzle, press Alt+S, and read the timing breakdown in the panel.
For Patches you can set the drag pace with `localStorage['lgs-patches-pace']` = `sync` | `task` | `frame`.
