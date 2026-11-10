// LarpedIn site: theme toggle, browser picker, copy button and the Read → Solve → Play demo.
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------------- config ----------------
  // Paste each store's listing URL once it is published. Empty = not listed yet.
  // Brave and Opera install from the Chrome Web Store.
  const STORES = {
    chrome: '',  // https://chromewebstore.google.com/detail/<id>
    edge: '',    // https://microsoftedge.microsoft.com/addons/detail/<id>
    firefox: '', // https://addons.mozilla.org/firefox/addon/larpedin/
    safari: '',  // https://apps.apple.com/app/id<id>
  };
  const MANAGERS = {
    tampermonkey: 'https://www.tampermonkey.net/',
    userscripts: 'https://apps.apple.com/app/userscripts/id1463298887', // free, Safari
  };
  // storeKey: which STORES entry serves the browser. page: address to open for hand installs.
  const BROWSERS = {
    chrome:  { name: 'Chrome',  storeKey: 'chrome',  chromium: true, page: 'chrome://extensions' },
    edge:    { name: 'Edge',    storeKey: 'edge',    chromium: true, page: 'edge://extensions' },
    brave:   { name: 'Brave',   storeKey: 'chrome',  chromium: true, page: 'brave://extensions' },
    opera:   { name: 'Opera',   storeKey: 'chrome',  chromium: true, page: 'opera://extensions' },
    firefox: { name: 'Firefox', storeKey: 'firefox', chromium: false, page: 'about:debugging#/runtime/this-firefox' },
    safari:  { name: 'Safari',  storeKey: 'safari',  chromium: false, page: '' },
  };
  const KEY = 'larpedin-browser', THEME_KEY = 'larpedin-theme';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------------- theme toggle ----------------
  (function theme() {
    const btn = $('[data-theme-toggle]');
    const root = document.documentElement;
    const apply = (t, save) => {
      root.setAttribute('data-theme', t);
      const m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#17130F' : '#F7F0E1');
      const c = $('meta[name="color-scheme"]'); if (c) c.setAttribute('content', t);
      if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      if (save) store.set(THEME_KEY, t);
    };
    apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', false);
    btn?.addEventListener('click', () => apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true));
  })();

  // ---------------- install picker ----------------
  let info = null; // downloads/latest.json
  const kb = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const EXT_ICON = '<svg class="ext" viewBox="0 0 20 20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V12M11 4h5v5M16 4l-7 7"/></svg>';
  const ua = navigator.userAgent;
  const isMac = /Mac/.test(navigator.platform || ua) && !/iPhone|iPad/.test(ua);
  const phone = /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  const root = $('[data-install]');
  const out = $('[data-install-out]');
  const statusEl = $('[data-install-status]');
  if (root && out) {
    if (phone) $('[data-phone-note]').hidden = false;

    const shortcut = isMac ? '<kbd>Option</kbd>+<kbd>S</kbd>' : '<kbd>Alt</kbd>+<kbd>S</kbd>';

    function render(id) {
      const b = BROWSERS[id];
      if (!b) { out.innerHTML = '<p class="pick-hint">Pick your browser.</p>'; return; }
      const storeUrl = STORES[b.storeKey];
      const xpi = id === 'firefox' && info?.xpi?.file ? info.xpi : null;
      const us = info?.userscript || {};
      const usFile = us.file || 'larpedin.user.js';
      const zipFile = info?.file || 'larpedin.zip';
      let html = '';

      if (storeUrl) {
        html += `<div class="primary"><a class="btn btn-big" href="${esc(storeUrl)}" target="_blank" rel="noopener">Add to ${b.name}${EXT_ICON}</a></div>`;
      } else if (xpi) {
        const meta = xpi.size ? ` <span class="muted">${kb(xpi.size)}</span>` : '';
        html += `<div class="primary"><a class="btn btn-big" href="downloads/${esc(xpi.file)}">Add to Firefox</a></div>
          <p class="note">Firefox will ask you to allow the install.${meta}</p>`;
      } else {
        const manager = id === 'safari'
          ? { label: 'Get Userscripts', href: MANAGERS.userscripts, tail: 'A free app from the App Store.' }
          : { label: 'Get Tampermonkey', href: MANAGERS.tampermonkey, tail: '' };
        const size = us.size ? ` <span class="muted">${kb(us.size)}</span>` : '';
        html += `<ol class="isteps">
          <li><span class="n" aria-hidden="true">1</span><div><a class="btn" href="${manager.href}" target="_blank" rel="noopener">${manager.label}${EXT_ICON}</a>${manager.tail ? `<p class="note">${manager.tail}</p>` : ''}</div></li>
          <li><span class="n" aria-hidden="true">2</span><div><a class="btn" href="downloads/${esc(usFile)}">Install LarpedIn</a>${size ? `<p class="note">One click. ${kb(us.size)}.</p>` : ''}</div></li>
          <li><span class="n" aria-hidden="true">3</span><div><p class="step-text">Open a LinkedIn game and press ${shortcut}.</p></div></li>
        </ol>`;
        if (b.chromium) html += `<p class="note">${id === 'chrome' ? 'Chrome 138 and later ask' : 'Your browser may ask'} you to turn on "Allow user scripts" for Tampermonkey.</p>`;
        if (id === 'safari') html += `<p class="note">Prefer Tampermonkey? <a href="${MANAGERS.tampermonkey}" target="_blank" rel="noopener">It works on Safari too</a>.</p>`;
        if (b.chromium || id === 'firefox') {
          const hand = b.chromium
            ? `<ol class="isteps compact">
                <li><span class="n" aria-hidden="true">1</span><div><p class="step-text"><a href="downloads/${esc(zipFile)}" download>Download larpedin.zip</a>${info?.size ? ` <span class="muted">${kb(info.size)}</span>` : ''} and unzip it.</p></div></li>
                <li><span class="n" aria-hidden="true">2</span><div><p class="step-text">Open <code>${b.page}</code> in a new tab.</p><button type="button" class="btn btn-copy" data-copy="${b.page}"><span data-copy-label>Copy ${b.page}</span></button></div></li>
                <li><span class="n" aria-hidden="true">3</span><div><p class="step-text">Turn on <b>Developer mode</b>, choose <b>Load unpacked</b> and pick the unzipped folder.</p></div></li>
              </ol>`
            : `<ol class="isteps compact">
                <li><span class="n" aria-hidden="true">1</span><div><p class="step-text"><a href="downloads/larpedin-firefox.zip" download>Download larpedin-firefox.zip</a>. Don't unzip it.</p></div></li>
                <li><span class="n" aria-hidden="true">2</span><div><p class="step-text">Open <code>${b.page}</code> in a new tab.</p><button type="button" class="btn btn-copy" data-copy="${b.page}"><span data-copy-label>Copy address</span></button></div></li>
                <li><span class="n" aria-hidden="true">3</span><div><p class="step-text">Choose <b>Load Temporary Add-on</b> and pick the zip. It lasts until Firefox closes.</p></div></li>
              </ol>`;
          html += `<details class="manual"><summary>Or load the full extension by hand</summary>${hand}</details>`;
        }
      }
      out.innerHTML = html;
      wireCopy();
    }

    function select(id, announce) {
      render(id);
      if (announce && BROWSERS[id]) statusEl.textContent = `${BROWSERS[id].name} selected. Install steps follow.`;
    }

    $$('input[name="browser"]', root).forEach((r) => r.addEventListener('change', () => {
      store.set(KEY, r.value); select(r.value, true);
    }));
    // A returning visitor sees their earlier pick. First visit: nothing selected.
    const saved = store.get(KEY);
    if (saved && BROWSERS[saved]) {
      const r = $(`input[name="browser"][value="${saved}"]`, root);
      if (r) { r.checked = true; select(saved, false); }
    }

    fetch('downloads/latest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        info = j;
        const v = $('[data-version]');
        if (v && j.version) v.textContent = `Version ${j.version}. Free and open source.`;
        const cur = $('input[name="browser"]:checked', root);
        if (cur) render(cur.value);
      })
      .catch(() => { /* keep the static fallback */ });
  }

  // ---------------- copy buttons ----------------
  function wireCopy() {
    $$('[data-copy]:not([data-wired])').forEach((btn) => {
      btn.setAttribute('data-wired', '');
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
        label.textContent = ok ? 'Copied. Paste it in the address bar' : `Couldn't copy: type ${text}`;
        btn.classList.toggle('copied', ok);
        setTimeout(() => { label.textContent = original; btn.classList.remove('copied'); }, 2600);
      });
    });
  }

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
          say(done ? `solved: ${events.length} steps, ${backs} backtracks` : `search: ${k} steps, ${backs} backtracks`);
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
