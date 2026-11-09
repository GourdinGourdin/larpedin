// LarpedIn site: version info, store buttons per browser, copy button, hero board and the Read → Solve → Play demo.
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------------- version + size from downloads/latest.json ----------------
  const kb = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  fetch('downloads/latest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((info) => {
      const label = `v${info.version} · ${kb(info.size)} · free, open source`;
      $$('[data-version]').forEach((el) => (el.textContent = label));
      $$('[data-version-inline]').forEach((el) => (el.textContent = `(v${info.version}, ${kb(info.size)})`));
      $$('[data-download]').forEach((a) => {
        a.setAttribute('href', `downloads/${info.file}`);
        if (info.sha256) a.title = `SHA-256 ${info.sha256}`;
      });
      if (!info.userscript) $$('[data-userscript]').forEach((a) => a.replaceWith(document.createTextNode('userscript version (from the GitHub repo)')));
    })
    .catch(() => { /* keep the static fallback text */ });

  // ---------------- stores + browser detection ----------------
  // Paste each store's listing URL here once it is published; empty = "coming soon"
  // (the button then jumps to the hand-install steps for that browser).
  const STORES = {
    chrome: '',  // https://chromewebstore.google.com/detail/<id>
    edge: '',    // https://microsoftedge.microsoft.com/addons/detail/<id>
    firefox: '', // https://addons.mozilla.org/firefox/addon/larpedin/
    safari: '',  // https://apps.apple.com/app/id<id>
  };
  const MANUAL = { chrome: '#manual-chromium', edge: '#manual-chromium', firefox: '#manual-firefox', safari: '#manual-safari' };

  function detect() {
    const ua = navigator.userAgent;
    const brands = (navigator.userAgentData?.brands || []).map((b) => b.brand).join(' ');
    const android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const mobile = android || ios || (navigator.userAgentData?.mobile ?? /Mobile/i.test(ua));
    let name = 'Chrome', store = 'chrome', extPage = 'chrome://extensions';
    if (/Firefox\/|FxiOS\//.test(ua)) { name = 'Firefox'; store = 'firefox'; extPage = 'about:addons'; }
    else if (/Edg(e|A|iOS)?\//.test(ua) || /Edge/.test(brands)) { name = 'Edge'; store = 'edge'; extPage = 'edge://extensions'; }
    else if (/OPR\//.test(ua) || /Opera/.test(brands)) { name = 'Opera'; extPage = 'opera://extensions'; }
    else if (/Brave/.test(brands) || navigator.brave) { name = 'Brave'; extPage = 'brave://extensions'; }
    else if (/Vivaldi/.test(ua)) { name = 'Vivaldi'; extPage = 'vivaldi://extensions'; }
    else if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\//.test(ua)) { name = 'Safari'; store = 'safari'; }
    // Phones: only Firefox for Android and Safari on iOS run extensions.
    let hint = '';
    if (ios) {
      if (store !== 'safari') hint = 'On iPhone and iPad, extensions only run in Safari. Open this page in Safari to install.';
      store = 'safari'; name = 'Safari';
    } else if (android && store !== 'firefox') {
      hint = `${name} on Android can't run extensions. Install Firefox for Android, then add LarpedIn from Firefox Add-ons.`;
      store = 'firefox'; name = 'Firefox';
    }
    return { name, store, extPage, mobile, hint };
  }

  (function stores() {
    const b = detect();
    let missing = false;
    $$('[data-store]').forEach((card) => {
      const id = card.getAttribute('data-store');
      const link = $('[data-store-link]', card);
      const url = STORES[id];
      card.classList.toggle('is-detected', id === b.store);
      if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener'; }
      else { link.href = MANUAL[id]; link.insertAdjacentHTML('afterend', '<span class="soon">Coming soon</span>'); missing = true; }
    });
    if (missing) $$('[data-store-note]').forEach((el) => (el.hidden = false));
    // Put the visitor's browser first.
    const list = $('[data-stores]'); const mine = $(`[data-store="${b.store}"]`);
    if (list && mine) list.prepend(mine);

    const url = STORES[b.store];
    $$('[data-install-primary]').forEach((a) => {
      a.href = url || (b.mobile ? MANUAL[b.store] : '#install');
      if (url) { a.target = '_blank'; a.rel = 'noopener'; }
      const label = $('[data-install-label]', a);
      if (a.hasAttribute('data-short')) a.textContent = `Add to ${b.name}`;
      else if (label) label.textContent = `Add to ${b.name}, it's free`;
    });
    $$('[data-ext-page]').forEach((btn) => {
      btn.setAttribute('data-copy', b.extPage);
      const l = $('[data-copy-label]', btn); if (l) l.textContent = `Copy ${b.extPage}`;
    });
    if (b.hint) $$('[data-browser-hint]').forEach((el) => { el.textContent = b.hint; el.hidden = false; });
  })();

  // ---------------- copy buttons ----------------
  $$('[data-copy]').forEach((btn) => {
    const label = $('[data-copy-label]', btn) || btn;
    const original = label.textContent;
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.append(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch {}
        ta.remove();
      }
      label.textContent = ok ? 'Copied! Paste it in the address bar' : `Couldn't copy: type ${text}`;
      btn.classList.toggle('copied', ok);
      setTimeout(() => { label.textContent = original; btn.classList.remove('copied'); }, 2600);
    });
  });

  // ---------------- hero board (decorative) ----------------
  (function heroBoard() {
    const board = $('[data-hero-board]');
    if (!board) return;
    const N = 6;
    const colors = ['var(--zip)', 'var(--queens)', 'var(--tango)', 'var(--patches)', 'var(--wend)'];
    // snake order through a 6x6 grid
    const order = [];
    for (let r = 0; r < N; r++) for (let k = 0; k < N; k++) order.push(r * N + (r % 2 ? N - 1 - k : k));
    const cells = Array.from({ length: N * N }, () => document.createElement('span'));
    order.forEach((idx, i) => {
      const c = cells[idx];
      c.style.setProperty('--i', i);
      c.style.setProperty('--c', colors[Math.floor(i / (N * N / colors.length + 0.01))]);
    });
    [0, 11, 17, 24, 35].forEach((i) => cells[order[i]].classList.add('dot'));
    board.append(...cells);
    const start = () => cells.forEach((c) => c.classList.add('on'));
    if (reduceMotion.matches) start(); else setTimeout(start, 300);
  })();

  // ---------------- Read → Solve → Play demo ----------------
  (function demo() {
    const root = $('[data-demo]');
    if (!root) return;
    const svg = $('[data-demo-svg]', root);
    const readout = $('[data-demo-readout]', root);
    const toggle = $('[data-demo-toggle]', root);
    const toggleLabel = $('[data-demo-toggle-label]', root);
    const steps = $$('.step', root);

    // Puzzle: 5x5, numbered cells must be visited in order, every cell exactly once.
    const N = 5, S = 60, PAD = 4;
    const NUMS = new Map([[0, 1], [14, 2], [20, 3], [8, 4], [12, 5]]); // cell index -> number
    const LAST = 5;
    const neighbours = (i) => {
      const r = (i / N) | 0, c = i % N, o = [];
      if (r > 0) o.push(i - N); if (c < N - 1) o.push(i + 1); if (r < N - 1) o.push(i + N); if (c > 0) o.push(i - 1);
      return o;
    };
    // Plain backtracking search. Records every step (cell pushed, or -1 for a backtrack) when asked.
    function solve(record) {
      const seen = new Uint8Array(N * N), path = [0], events = record ? [] : null;
      seen[0] = 1;
      const go = (cur, next) => {
        if (path.length === N * N) return NUMS.get(cur) === LAST;
        for (const n of neighbours(cur)) {
          if (seen[n]) continue;
          const v = NUMS.get(n);
          if (v !== undefined && v !== next) continue;
          seen[n] = 1; path.push(n); events && events.push(n);
          if (go(n, v !== undefined ? next + 1 : next)) return true;
          seen[n] = 0; path.pop(); events && events.push(-1);
        }
        return false;
      };
      return go(0, 2) ? { path, events } : null;
    }
    const solved = solve(true);
    if (!solved) return;
    const solution = solved.path, events = solved.events;

    // Real timing in this browser.
    requestIdleCallbackSafe(() => {
      const runs = 200, t0 = performance.now();
      for (let i = 0; i < runs; i++) solve(false);
      const ms = (performance.now() - t0) / runs;
      const el = $('[data-demo-bench-ms]');
      if (el) el.textContent = ms < 0.01 ? '< 0.01 ms' : `${ms.toFixed(3)} ms`;
    });

    // ---- build the SVG ----
    const el = (name, attrs = {}, parent = svg) => {
      const e = document.createElementNS(SVG, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      parent.append(e); return e;
    };
    const centre = (i) => [(i % N) * S + S / 2, ((i / N) | 0) * S + S / 2];
    const pts = (list) => list.map((i) => centre(i).join(',')).join(' ');
    const cellEls = [];
    for (let i = 0; i < N * N; i++) {
      cellEls.push(el('rect', { class: 'cell', x: (i % N) * S + PAD, y: ((i / N) | 0) * S + PAD, width: S - 2 * PAD, height: S - 2 * PAD, rx: 11 }));
    }
    const scan = el('rect', { class: 'scanline', x: 0, y: 0, width: N * S, height: S, rx: 12 });
    const ghost = el('polyline', { class: 'ghost-path', points: '' });
    const tryPath = el('polyline', { class: 'try-path', points: '' });
    const finalPath = el('polyline', { class: 'final-path', points: '' });
    const numGroups = [];
    for (const [i, v] of NUMS) {
      const [x, y] = centre(i);
      const g = el('g');
      el('circle', { class: 'num-dot', cx: x, cy: y, r: 15 }, g);
      el('text', { class: 'num-txt', x, y }, g).textContent = v;
      numGroups.push({ g, row: (i / N) | 0 });
    }
    const cursor = el('path', { class: 'cursor', d: 'M0 0 L0 22 L6 16.5 L10.5 26 L14 24.4 L9.6 15.2 L17 15 Z' });

    // ---- timeline ----
    const STAGES = [ // [start, end] ms
      [0, 2200],     // read
      [2200, 5600],  // solve
      [5600, 8600],  // play
    ];
    const LOOP = 11000;
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => 1 - Math.pow(1 - x, 2);

    let stackCache = { k: -1, stack: [0] };
    function stackAt(k) {
      if (k < stackCache.k) stackCache = { k: -1, stack: [0] };
      const st = stackCache.stack;
      for (let j = stackCache.k + 1; j < k; j++) { const e = events[j]; if (e < 0) st.pop(); else st.push(e); }
      stackCache.k = Math.max(stackCache.k, k - 1);
      return st;
    }

    let lastText = '';
    function say(t) { if (t !== lastText) { readout.textContent = t; lastText = t; } }

    function render(t) {
      const stage = t < STAGES[1][0] ? 0 : t < STAGES[2][0] ? 1 : 2;
      const p = STAGES.map(([a, b]) => clamp((t - a) / (b - a)));
      steps.forEach((s, i) => {
        s.classList.toggle('active', i === stage && t < STAGES[2][1] + 200);
        s.classList.toggle('done', i < stage || t >= STAGES[2][1] + 200);
      });

      // READ: a scan bar sweeps the rows; numbers appear as their row is read
      const rowsRead = p[0] * N;
      scan.style.display = stage === 0 && p[0] < 1 ? '' : 'none';
      scan.setAttribute('y', Math.min(N - 1, Math.floor(rowsRead)) * S);
      numGroups.forEach(({ g, row }) => (g.style.opacity = row < rowsRead || stage > 0 ? 1 : 0.15));
      cellEls.forEach((c, i) => c.classList.toggle('scanned', stage === 0 && ((i / N) | 0) === Math.floor(rowsRead) && p[0] < 1));
      if (stage === 0) say(p[0] < 1 ? `read: row ${Math.min(N, Math.floor(rowsRead) + 1)}/${N}` : `read: 5×5 grid, ${NUMS.size} numbers`);

      // SOLVE: replay the search, then show the answer as a dotted line
      if (stage >= 1) {
        const k = stage === 1 ? Math.round(ease(p[1]) * events.length) : events.length;
        const done = k >= events.length;
        const st = done ? solution : stackAt(k);
        tryPath.setAttribute('points', stage === 1 && !done ? pts(st) : '');
        ghost.setAttribute('points', done && stage === 1 || stage === 2 ? pts(solution) : '');
        if (stage === 1) {
          const backs = events.slice(0, k).filter((e) => e < 0).length;
          say(done ? `solved: ${events.length} steps, ${backs} backtracks` : `search: ${k} steps · ${backs} backtracks`);
        }
      } else {
        tryPath.setAttribute('points', ''); ghost.setAttribute('points', '');
      }

      // PLAY: drag along the path; cells fill as the cursor passes
      if (stage === 2) {
        const f = ease(p[2]) * (solution.length - 1);
        const n = Math.floor(f), frac = f - n;
        const drawn = solution.slice(0, n + 1);
        const [x0, y0] = centre(solution[n]);
        const [x1, y1] = centre(solution[Math.min(n + 1, solution.length - 1)]);
        const hx = x0 + (x1 - x0) * frac, hy = y0 + (y1 - y0) * frac;
        finalPath.setAttribute('points', `${pts(drawn)} ${hx},${hy}`);
        cellEls.forEach((c, i) => c.classList.toggle('filled', drawn.includes(i)));
        cursor.style.display = '';
        cursor.setAttribute('transform', `translate(${hx - 2} ${hy - 2})`);
        say(p[2] < 1 ? `play: dragging… ${n + 1}/${solution.length} cells` : 'done: every cell visited, 1 → 5 in order');
        if (p[2] >= 1) cursor.style.display = 'none';
      } else {
        finalPath.setAttribute('points', '');
        cellEls.forEach((c) => c.classList.remove('filled'));
        cursor.style.display = 'none';
      }
    }

    // ---- playback ----
    let t = 0, playing = !reduceMotion.matches, visible = true, last = 0, raf = 0;
    function frame(now) {
      raf = 0;
      if (!playing || !visible) return;
      t += Math.min(64, now - (last || now));
      last = now;
      if (t > LOOP) t = 0;
      render(t);
      raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && playing && visible) { last = 0; raf = requestAnimationFrame(frame); } }
    function setPlaying(v) {
      playing = v;
      toggle.setAttribute('aria-pressed', String(!v));
      toggleLabel.textContent = v ? 'Pause' : 'Play';
      kick();
    }
    toggle.addEventListener('click', () => setPlaying(!playing));
    $$('[data-step-btn]', root).forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.getAttribute('data-step-btn'));
      // when paused, jump to the end of that step; when playing, replay from its start
      t = playing ? STAGES[i][0] : STAGES[i][1] - 1;
      if (!playing && i === 2) t = STAGES[2][1] + 300;
      render(t);
      kick();
    }));
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { threshold: 0.15 }).observe(root);
    }
    reduceMotion.addEventListener?.('change', (e) => { if (e.matches) setPlaying(false); });

    if (playing) { render(0); kick(); }
    else { t = STAGES[2][1] + 300; render(t); setPlaying(false); }
  })();

  function requestIdleCallbackSafe(fn) {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 2000 }); else setTimeout(fn, 600);
  }
})();
