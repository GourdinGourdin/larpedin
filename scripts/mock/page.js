// Runs inside the mock game pages (never on linkedin.com). window.__MOCK holds
// { game, puzzle } and this file builds a board that behaves like the real one
// as far as LarpedIn can tell: React fiber props on every cell and an input
// model driven by mouse events. It judges the moves it receives, so
// window.__mock.solved() is true only when the board really is solved.
(function () {
  const M = window.__MOCK, P = M.puzzle, game = M.game;
  const $ = (s, r) => (r || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const log = { events: { mousedown: 0, mousemove: 0, mouseup: 0, click: 0 }, moves: 0 };
  const api = window.__mock = { game, log, solved: () => false, state: () => ({}) };

  const root = $('#board');
  const grid = el('div', 'grid');
  grid.dataset.testid = 'interactive-grid';
  root.appendChild(grid);

  let rows, cols;
  const cells = [];
  const props = [];
  const fiber = (node, p, gridProps) => {
    node['__reactFiber$mock'] = gridProps ? { memoizedProps: p } : { return: { memoizedProps: p } };
  };
  function build(r, c, mk) {
    rows = r; cols = c;
    grid.style.gridTemplateColumns = `repeat(${c}, var(--cell))`;
    grid.style.setProperty('--cell', c >= 8 ? '48px' : '56px');
    fiber(grid, { gridRows: r, gridCols: c }, true);
    for (let i = 0; i < r * c; i++) {
      const cell = el('div', 'cell');
      cell.dataset.cellIdx = String(i);
      const p = { gridRows: r, gridCols: c, gridSize: r === c ? r : undefined, ...mk(i) };
      fiber(cell, p);
      cells.push(cell); props.push(p);
      grid.appendChild(cell);
    }
  }
  const cellOf = (t) => { const c = t && t.closest && t.closest('[data-cell-idx]'); return c ? +c.dataset.cellIdx : -1; };
  const rc = (i) => [Math.floor(i / cols), i % cols];
  const banner = (on) => { document.body.dataset.solved = on ? '1' : '0'; $('#status').textContent = on ? 'Solved. Nice work!' : 'Unsolved'; $('#status').className = on ? 'ok' : ''; };
  const count = (t) => { log.events[t]++; };
  ['mousedown', 'mousemove', 'mouseup', 'click'].forEach((t) => grid.addEventListener(t, () => count(t), true));

  // ---------------------------------------------------------------- queens
  if (game === 'queens') {
    const COLORS = ['#BBA3E2', '#FFC992', '#96BEFF', '#B3DFA0', '#DFDFDF', '#FF7B60', '#E6F388', '#B9B29E', '#DFA0BF', '#A3D2D8'];
    const n = P.size;
    build(n, n, (i) => ({ cellMeta: { color: P.regions[i] } }));
    const st = new Array(n * n).fill(0); // 0 empty, 1 X, 2 queen
    cells.forEach((c, i) => {
      c.style.background = COLORS[P.regions[i] % COLORS.length];
      c.addEventListener('click', () => {
        st[i] = (st[i] + 1) % 3; log.moves++;
        c.innerHTML = st[i] === 1 ? '<span data-testid="cross-svg">×</span>'
          : st[i] === 2 ? '<svg data-testid="queen-svg" width="30" height="30" viewBox="0 0 24 24"><path d="M3 18h18l-2-10-4 4-3-7-3 7-4-4z" fill="#222"/></svg>' : '';
        banner(api.solved());
      });
    });
    api.solved = () => {
      const q = st.map((s, i) => (s === 2 ? i : -1)).filter((i) => i >= 0);
      if (q.length !== n) return false;
      const R = new Set(q.map((i) => Math.floor(i / n))), C = new Set(q.map((i) => i % n)), G = new Set(q.map((i) => P.regions[i]));
      if (R.size !== n || C.size !== n || G.size !== n) return false;
      for (const a of q) for (const b of q) if (a < b && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1) return false;
      return true;
    };
    api.state = () => ({ st });
  }

  // ----------------------------------------------------------------- tango
  if (game === 'tango') {
    const n = P.size;
    const edgeProps = P.edges.map(([a, b, k]) => ({ startIdx: a, endIdx: b, isEqual: k === '=' }));
    const val = new Array(n * n).fill(-1);
    build(n, n, (i) => ({
      edges: edgeProps,
      cellData: { state: i in P.given ? (P.given[i] ? 'LotkaCellValue_ONE' : 'LotkaCellValue_ZERO') : 'LotkaCellValue_EMPTY', isLocked: i in P.given },
    }));
    const FIRST = 0; // empty -> zero (moon) -> one (sun) -> empty
    const draw = (i) => {
      const v = val[i], p = props[i].cellData;
      p.state = v === 1 ? 'LotkaCellValue_ONE' : v === 0 ? 'LotkaCellValue_ZERO' : 'LotkaCellValue_EMPTY';
      cells[i].innerHTML = v === 1 ? '<svg data-testid="cell-one" width="28" height="28" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="#F2A414"/></svg>'
        : v === 0 ? '<svg data-testid="cell-zero" width="28" height="28" viewBox="0 0 24 24"><path d="M15 4a8 8 0 1 0 5 12A8 8 0 0 1 15 4z" fill="#2C6BD3"/></svg>' : '';
      cells[i].classList.toggle('locked', !!p.isLocked);
    };
    for (let i = 0; i < n * n; i++) { if (i in P.given) val[i] = P.given[i]; draw(i); }
    // = and x markers sit on top of the grid (not cells)
    P.edges.forEach(([a, b, k]) => {
      const m = el('span', 'edge', k === '=' ? '=' : '×');
      const [ar, ac] = rc(a), [br, bc] = rc(b);
      m.style.left = `calc((${ac} + ${bc} + 1) * var(--cell) / 2 + 2px)`;
      m.style.top = `calc((${ar} + ${br} + 1) * var(--cell) / 2 + 2px)`;
      grid.appendChild(m);
    });
    cells.forEach((c, i) => c.addEventListener('click', () => {
      if (props[i].cellData.isLocked) return;
      log.moves++;
      val[i] = val[i] < 0 ? FIRST : val[i] === FIRST ? 1 - FIRST : -1;
      draw(i); banner(api.solved());
    }));
    api.solved = () => {
      if (val.some((v) => v < 0)) return false;
      for (let a = 0; a < n; a++) {
        let r1 = 0, c1 = 0;
        for (let b = 0; b < n; b++) { r1 += val[a * n + b]; c1 += val[b * n + a]; }
        if (r1 !== n / 2 || c1 !== n / 2) return false;
        for (let b = 0; b + 2 < n; b++) {
          if (val[a * n + b] === val[a * n + b + 1] && val[a * n + b] === val[a * n + b + 2]) return false;
          if (val[b * n + a] === val[(b + 1) * n + a] && val[b * n + a] === val[(b + 2) * n + a]) return false;
        }
      }
      return P.edges.every(([a, b, k]) => (k === '=') === (val[a] === val[b]));
    };
    api.state = () => ({ val });
  }

  // ------------------------------------------------------------------- zip
  if (game === 'zip') {
    const n = P.rows * P.cols;
    const walls = P.walls.map(([cellIdx, direction]) => ({ cellIdx, direction }));
    build(P.rows, P.cols, (i) => ({ sequenceNo: i in P.numbers ? P.numbers[i] : -1, walls, path: [] }));
    const last = Math.max(...Object.values(P.numbers));
    const numAt = (i) => (i in P.numbers ? P.numbers[i] : -1);
    const blocked = (a, b) => {
      const [ar, ac] = rc(a), [br, bc] = rc(b);
      const dir = br === ar + 1 ? 'DOWN' : br === ar - 1 ? 'UP' : bc === ac + 1 ? 'RIGHT' : 'LEFT';
      const opp = { DOWN: 'UP', UP: 'DOWN', LEFT: 'RIGHT', RIGHT: 'LEFT' }[dir];
      return walls.some((w) => (w.cellIdx === a && w.direction === dir) || (w.cellIdx === b && w.direction === opp));
    };
    const adj = (a, b) => { const [ar, ac] = rc(a), [br, bc] = rc(b); return Math.abs(ar - br) + Math.abs(ac - bc) === 1; };
    let path = [], down = false, next = 0;
    const paint = () => {
      props[0].path = path.slice();
      cells.forEach((c, i) => {
        const at = path.indexOf(i), on = at >= 0;
        if (on) { c.classList.add('on'); let f = c.querySelector('[data-testid="filled-cell"]'); if (!f) { f = el('i', 'fill'); f.dataset.testid = 'filled-cell'; c.appendChild(f); } }
        else { c.classList.remove('on'); const f = c.querySelector('[data-testid="filled-cell"]'); if (f) f.remove(); }
      });
      // draw the path as one line through the cell centres, like the real game
      let svg = grid.querySelector('svg.zpath');
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'zpath'); grid.appendChild(svg); }
      const w = cells[0].offsetWidth;
      const pts = path.map((i) => `${cells[i].offsetLeft + w / 2},${cells[i].offsetTop + w / 2}`).join(' ');
      svg.innerHTML = path.length ? `<polyline points="${pts}" fill="none" stroke="#EC6A2E" stroke-width="${w * 0.42}" stroke-linecap="round" stroke-linejoin="round"/>` : '';
      banner(api.solved());
    };
    cells.forEach((c, i) => {
      const s = numAt(i);
      if (s >= 0) c.appendChild(el('b', 'num', String(s + 1)));
      const w = walls.filter((x) => x.cellIdx === i);
      for (const x of w) c.classList.add('w-' + x.direction.toLowerCase());
    });
    grid.addEventListener('mousedown', (e) => {
      const i = cellOf(e.target);
      if (i < 0 || e.button !== 0) return;
      if (numAt(i) === 0) { path = [i]; next = 1; down = true; paint(); }
      else if (path.length && i === path[path.length - 1]) down = true;
    });
    grid.addEventListener('mousemove', (e) => {
      if (!down) return;
      const i = cellOf(e.target);
      if (i < 0) return;
      const tail = path[path.length - 1];
      if (i === tail || !adj(tail, i) || blocked(tail, i)) return;
      if (path.length > 1 && i === path[path.length - 2]) { if (numAt(tail) >= 0) next = numAt(tail); path.pop(); paint(); return; }
      if (path.includes(i)) return;
      const s = numAt(i);
      if (s >= 0 && s !== next) return;
      if (s === next) next++;
      path.push(i); log.moves++; paint();
    });
    window.addEventListener('mouseup', () => { down = false; });
    api.solved = () => path.length === n && next === last + 1 && numAt(path[0]) === 0 && numAt(path[n - 1]) === last;
    api.state = () => ({ path });
    // keyboard fallback: Enter on a cell extends the path (like the real game's keyboard mode)
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const i = cellOf(e.target);
      if (i < 0) return;
      const tail = path[path.length - 1];
      if (!path.length) { if (numAt(i) === 0) { path = [i]; next = 1; paint(); } return; }
      if (!adj(tail, i) || blocked(tail, i) || path.includes(i)) return;
      const s = numAt(i);
      if (s >= 0 && s !== next) return;
      if (s === next) next++;
      path.push(i); paint();
    });
    cells.forEach((c) => c.tabIndex = 0);
  }

  // --------------------------------------------------------------- patches
  if (game === 'patches') {
    const clueCells = P.clues.map(([cellIdx, shape, size]) => ({ cellIdx, shapeConstraint: 'PatchesShapeConstraint_' + shape, numberConstraint: size || null }));
    build(P.rows, P.cols, () => ({ clueCells }));
    const HUES = ['#BBA3E2', '#FFC992', '#96BEFF', '#B3DFA0', '#E6F388', '#DFA0BF', '#A3D2D8', '#FF9B85', '#C9C2A8'];
    const placed = []; // [top,left,h,w]
    let from = -1, cur = -1;
    const glyph = { SQUARE: '□', VERTICAL_RECT: '▯', HORIZONTAL_RECT: '▭', ANY: '?' };
    for (const [ci, shape, size] of P.clues) cells[ci].appendChild(el('b', 'num', `${glyph[shape] || '?'}${size ? ' ' + size : ''}`));
    const rect = (a, b) => { const [ar, ac] = rc(a), [br, bc] = rc(b); const t = Math.min(ar, br), l = Math.min(ac, bc); return [t, l, Math.abs(ar - br) + 1, Math.abs(ac - bc) + 1]; };
    const inRect = (r, i) => { const [y, x] = rc(i); return y >= r[0] && y < r[0] + r[2] && x >= r[1] && x < r[1] + r[3]; };
    const paint = (preview) => {
      cells.forEach((c, i) => {
        const k = placed.findIndex((r) => inRect(r, i));
        c.style.background = k >= 0 ? HUES[k % HUES.length] : (preview && inRect(preview, i) ? '#E9E0CD' : '');
      });
    };
    const shapeOk = (shape, h, w) => shape === 'SQUARE' ? h === w : shape === 'VERTICAL_RECT' ? h > w : shape === 'HORIZONTAL_RECT' ? w > h : true;
    grid.addEventListener('mousedown', (e) => { const i = cellOf(e.target); if (i >= 0) { from = cur = i; paint(rect(i, i)); } });
    grid.addEventListener('mousemove', (e) => { if (from < 0) return; const i = cellOf(e.target); if (i >= 0) { cur = i; paint(rect(from, cur)); } });
    window.addEventListener('mouseup', (e) => {
      if (from < 0) return;
      const i = cellOf(e.target); if (i >= 0) cur = i;
      const r = rect(from, cur);
      from = -1;
      // placing over existing rectangles replaces them (like erasing); a rectangle that is not wanted is dropped
      for (let k = placed.length - 1; k >= 0; k--) if (cells.some((_, j) => inRect(r, j) && inRect(placed[k], j))) placed.splice(k, 1);
      if (r[2] * r[3] > 1 || P.clues.some(([ci]) => inRect(r, ci))) placed.push(r);
      log.moves++; paint(); banner(api.solved());
    });
    api.solved = () => {
      const owner = new Array(P.rows * P.cols).fill(-1);
      for (let k = 0; k < placed.length; k++) for (let j = 0; j < owner.length; j++) if (inRect(placed[k], j)) { if (owner[j] >= 0) return false; owner[j] = k; }
      if (owner.some((o) => o < 0)) return false;
      return placed.every((r) => {
        const inside = P.clues.filter(([ci]) => inRect(r, ci));
        if (inside.length !== 1) return false;
        const [, shape, size] = inside[0];
        return shapeOk(shape, r[2], r[3]) && (!size || size === r[2] * r[3]);
      });
    };
    api.state = () => ({ placed });
  }

  // ------------------------------------------------------------------ wend
  if (game === 'wend') {
    const list = el('div', 'wlist');
    list.dataset.testid = 'wend-word-list';
    fiber(list, { puzzleLetters: P.letters, solutionWords: P.solution.map((s) => ({ sequencingIndex: s })), guesses: [] }, true);
    P.lengths.forEach((len, w) => {
      const row = el('div', 'slots');
      for (let k = 0; k < len; k++) { const s = el('i', 'slot'); s.dataset.testid = `wend-word-list-slot-${w}-${k}`; row.appendChild(s); }
      list.appendChild(row);
    });
    const ins = el('p', 'ins', `Find ${P.lengths.length} hidden words of ${P.lengths.slice(0, -1).join(', ')} and ${P.lengths[P.lengths.length - 1]} letters`);
    ins.dataset.testid = 'wend-instructions';
    root.prepend(ins); root.appendChild(list);
    build(P.rows, P.cols, (i) => ({ idx: i, letter: P.letters[i], isLocked: false, isSelected: false }));
    cells.forEach((c, i) => { if (P.letters[i]) c.appendChild(el('span', 'tile', P.letters[i])); else c.classList.add('hole'); });
    const keyOf = (p) => p.join(',');
    const answers = P.solution.map(keyOf);
    const found = new Set();
    let sel = [], down = false;
    const adj = (a, b) => { const [ar, ac] = rc(a), [br, bc] = rc(b); return Math.abs(ar - br) + Math.abs(ac - bc) === 1; };
    const paint = () => {
      cells.forEach((c, i) => {
        props[i].isSelected = sel.includes(i);
        c.classList.toggle('sel', props[i].isSelected);
        c.classList.toggle('lock', props[i].isLocked);
      });
      banner(api.solved());
    };
    const commit = () => {
      const k = keyOf(sel);
      if (answers.includes(k) && !found.has(k)) {
        found.add(k);
        for (const i of sel) {
          props[i].isLocked = true;
          const m = el('i', 'lk'); m.dataset.testid = `cell-${i}-locked-check`; cells[i].appendChild(m);
        }
        log.moves++;
      }
      sel = []; paint();
    };
    grid.addEventListener('mousedown', (e) => { const i = cellOf(e.target); if (i >= 0 && P.letters[i] && !props[i].isLocked) { sel = [i]; down = true; paint(); } });
    grid.addEventListener('mousemove', (e) => {
      if (!down) return;
      const i = cellOf(e.target);
      if (i < 0 || !P.letters[i] || props[i].isLocked || i === sel[sel.length - 1]) return;
      if (sel.length > 1 && i === sel[sel.length - 2]) { sel.pop(); paint(); return; }
      if (adj(sel[sel.length - 1], i) && !sel.includes(i)) { sel.push(i); paint(); }
    });
    window.addEventListener('mouseup', () => { if (down) { down = false; commit(); } });
    // Enter on cells (keyboard input) builds a selection too, committing when it matches a word
    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') { sel = []; paint(); return; }
      if (e.key !== 'Enter') return;
      const i = cellOf(e.target);
      if (i < 0 || !P.letters[i] || props[i].isLocked) return;
      if (!sel.length || (adj(sel[sel.length - 1], i) && !sel.includes(i))) sel.push(i);
      if (answers.includes(keyOf(sel))) commit(); else paint();
    });
    cells.forEach((c) => c.tabIndex = 0);
    api.solved = () => found.size === answers.length && P.letters.every((l, i) => !l || props[i].isLocked);
    api.state = () => ({ found: [...found] });
  }

  banner(false);
})();
