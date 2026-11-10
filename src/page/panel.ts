// The in-page floating card. Lives in a Shadow DOM so LinkedIn's CSS can't
// reach it (and ours can't leak out); it is position:fixed, so it never
// shifts the page layout. Draggable by its header; collapses to a pill.
import { BRAND, baseCssVars, gameTheme, markSvg } from './theme.ts';
import { GAME_SETTINGS, fmtMs, type Settings, type Status, type Phase } from './settings.ts';

export interface PanelHandlers {
  onSolve(): void;
  onSettings(patch: Partial<Settings>): void;
  onExport(): void;
  debugInfo(): string;
}

interface Place { left: number; bottom: number; collapsed: boolean }

export { fmtMs };

const PLACE_KEY = 'lgs-panel';
const MARGIN = 8;

function loadPlace(): Place {
  const def: Place = { left: 16, bottom: 16, collapsed: false };
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) || '{}');
    return {
      left: Number.isFinite(p.left) ? p.left : def.left,
      bottom: Number.isFinite(p.bottom) ? p.bottom : def.bottom,
      collapsed: typeof p.collapsed === 'boolean' ? p.collapsed : def.collapsed,
    };
  } catch { return def; }
}
function savePlace(p: Place) { try { localStorage.setItem(PLACE_KEY, JSON.stringify(p)); } catch {} }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ICON = {
  gear: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11.3 1.7a1 1 0 0 0-2.6 0l-.2 1.2a7 7 0 0 0-1.6.9l-1.1-.5a1 1 0 0 0-1.3.4L3.2 5.9a1 1 0 0 0 .3 1.3l1 .7a7 7 0 0 0 0 1.9l-1 .7a1 1 0 0 0-.3 1.3l1.3 2.2a1 1 0 0 0 1.3.4l1.1-.5c.5.4 1 .7 1.6.9l.2 1.2a1 1 0 0 0 1.3.8h2a1 1 0 0 0 1-.8l.3-1.2c.6-.2 1.1-.5 1.6-.9l1.1.5a1 1 0 0 0 1.3-.4l1.3-2.2a1 1 0 0 0-.3-1.3l-1-.7a7 7 0 0 0 0-1.9l1-.7a1 1 0 0 0 .3-1.3l-1.3-2.2a1 1 0 0 0-1.3-.4l-1.1.5a7 7 0 0 0-1.6-.9ZM10 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg>',
  minimize: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 10h10"/></svg>',
  copy: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M7 7h9v9H7zM4 13V4h9"/></svg>',
  download: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M10 3v9m-4-4 4 4 4-4M4 16h12"/></svg>',
  check: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 10.5 3.2 3L15 6.5"/></svg>',
  alert: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 4h2v5H9V6Zm0 6.5h2v2H9v-2Z"/></svg>',
};

const CSS = `
${baseCssVars(':host')}
:host{
  --acc:var(--acc-l);--on-acc:#fff;
  --acc-soft:color-mix(in srgb,var(--acc) 12%,var(--ll-surface));
  --radius:14px;
  all:initial;position:fixed;z-index:2147483000;display:block;
  font:13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;
  color:var(--ll-ink);-webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme:dark){:host{--acc:var(--acc-d);--on-acc:#1F1B17}.mark svg rect{stroke:#4A423A;stroke-width:2}}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select{font:inherit;color:inherit}
button{cursor:pointer}
:focus{outline:none}
:focus-visible{outline:2px solid var(--ll-focus);outline-offset:2px;border-radius:8px}

.card{width:280px;background:var(--ll-surface);border:1px solid var(--ll-border);border-radius:var(--radius);
  box-shadow:var(--ll-shadow);overflow:hidden;position:relative}

.head{display:flex;align-items:center;gap:10px;padding:12px 8px 10px 12px;cursor:grab;user-select:none;touch-action:none}
.head:active{cursor:grabbing}
.mark{flex:none;display:block;width:28px;height:28px}
.mark svg{display:block}
.titles{flex:1;min-width:0;display:flex;flex-direction:column}
.brand{font-weight:700;font-size:13px;letter-spacing:-.01em}
.game{display:flex;align-items:center;gap:6px;color:var(--ll-muted);font-size:12px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--acc);flex:none}
.icon{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:var(--ll-muted)}
.icon:hover{background:var(--ll-surface2);color:var(--ll-ink)}
.icon[aria-expanded="true"]{background:var(--acc-soft);color:var(--acc)}

.body{padding:0 12px 12px;display:flex;flex-direction:column;gap:10px}

.status{background:var(--ll-surface2);border-radius:10px;padding:10px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:8px}
.step{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--ll-muted);font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.bar{height:4px;border-radius:2px;background:var(--ll-border);overflow:hidden;position:relative}
.step[data-s="active"] .bar::after{content:"";position:absolute;inset:0;background:var(--acc);animation:pulse 1s ease-in-out infinite}
.step[data-s="done"] .bar{background:var(--acc)}
.step[data-s="error"] .bar{background:var(--ll-danger)}
.step[data-s="active"],.step[data-s="done"]{color:var(--ll-ink)}
.step[data-s="error"]{color:var(--ll-danger)}
@keyframes pulse{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}

.msg{margin:0;display:flex;gap:6px;align-items:flex-start;min-height:18px}
.msg .ic{flex:none;margin-top:2px;display:none}
.card[data-phase="done"] .msg .ic.ok{display:block;color:var(--ll-success)}
.card[data-phase="error"] .msg .ic.err{display:block;color:var(--ll-danger)}
.card[data-phase="done"] .msg{font-weight:600}
.msg-text{overflow-wrap:anywhere}

.times{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:8px 0 0;padding-top:8px;border-top:1px dashed var(--ll-border)}
.times div{display:flex;flex-direction:column}
.times dt{font-size:11px;color:var(--ll-muted)}
.times dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}

.err-actions{display:flex;gap:6px;margin-top:8px}

.solve{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:40px;border:0;border-radius:10px;
  background:var(--acc);color:var(--on-acc);font-weight:700;font-size:14px;transition:filter .15s,transform .05s}
.solve:hover{filter:brightness(1.08)}
.solve:active{transform:translateY(1px)}
.solve[aria-disabled="true"]{cursor:progress;filter:none;opacity:.92}
.solve:focus-visible{outline-offset:3px;border-radius:10px}
kbd{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:3px 5px;border-radius:5px;
  background:color-mix(in srgb,var(--on-acc) 18%,transparent);color:inherit}

.row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
.row label{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;cursor:pointer}
.sub{display:block;font-size:11px;color:var(--ll-muted)}

.switch{appearance:none;-webkit-appearance:none;flex:none;margin:0;width:34px;height:20px;border-radius:10px;background:var(--ll-border);
  position:relative;cursor:pointer;transition:background .15s}
.switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
.switch:checked{background:var(--acc)}
.switch:checked::after{transform:translateX(14px)}
.switch:focus-visible{border-radius:10px}

.settings{border-top:1px solid var(--ll-border);padding-top:10px;display:flex;flex-direction:column;gap:10px}
.settings h3{margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--ll-muted)}
.game-settings{display:flex;flex-direction:column;gap:12px}
fieldset{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
legend{padding:0;margin-bottom:4px;font-weight:600}
legend .sub{font-weight:400;margin-top:1px}
.seg{display:flex;background:var(--ll-surface2);border-radius:8px;padding:2px;gap:2px}
.seg label{flex:1;position:relative}
.seg input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.seg span{display:block;text-align:center;padding:4px 6px;border-radius:6px;font-size:12px;color:var(--ll-muted)}
.seg input:checked+span{background:var(--ll-surface);color:var(--ll-ink);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.12)}
.seg input:focus-visible+span{outline:2px solid var(--ll-focus);outline-offset:1px}
.none{margin:0;color:var(--ll-muted);font-size:12px}

.ghost{white-space:nowrap;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--ll-border);
  background:var(--ll-surface);font-size:12px;font-weight:600}
.ghost:hover{background:var(--ll-surface2)}
.foot{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:11px;color:var(--ll-muted)}

.pill{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 6px;border-radius:20px;border:1px solid var(--ll-border);
  background:var(--ll-surface);box-shadow:var(--ll-shadow);font-weight:600;font-size:13px;cursor:pointer;touch-action:none;user-select:none}
.pill .mark{width:28px;height:28px}
.pill:focus-visible{border-radius:20px}
.pill .state{width:8px;height:8px;border-radius:50%;background:var(--acc)}
.pill[data-phase="reading"] .state,.pill[data-phase="solving"] .state,.pill[data-phase="playing"] .state{animation:blink .8s ease-in-out infinite alternate}
.pill[data-phase="done"] .state{background:var(--ll-success)}
.pill[data-phase="error"] .state{background:var(--ll-danger)}
@keyframes blink{to{opacity:.25}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}
  .step[data-s="active"] .bar::after{transform:none;opacity:.6}}
`;

const STEPS = ['read', 'solve', 'play'] as const;
const ACTIVE_STEP: Partial<Record<Phase, number>> = { reading: 0, solving: 1, playing: 2 };

export class Panel {
  private host: HTMLElement;
  private root: ShadowRoot;
  private place = loadPlace();
  private status: Status = { game: null, phase: 'idle' };
  private settings!: Settings;
  private game: string | null = null;
  private errStep = 0;
  private $ = <T extends Element = HTMLElement>(sel: string) => this.root.querySelector(sel) as T;

  constructor(private h: PanelHandlers, settings: Settings) {
    this.host = document.createElement('larpedin-panel');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = this.template();
    this.settings = settings;
    this.wire();
    this.renderSettings();
    this.renderStatus();
    this.applyCollapsed(false);
    addEventListener('resize', () => this.position(false));
  }

  get element() { return this.host; }

  show() {
    if (!this.host.isConnected) {
      (document.body ?? document.documentElement).appendChild(this.host);
      this.position(false);
    }
    this.host.hidden = false;
  }

  hide() { this.host.remove(); }

  /** Open the card if it is collapsed to the pill. */
  expand() { if (this.place.collapsed) this.setCollapsed(false); }

  setGame(id: string | null) {
    if (id === this.game) return;
    this.game = id;
    const t = gameTheme(id);
    this.host.style.setProperty('--acc-l', t.accent);
    this.host.style.setProperty('--acc-d', t.accentDark);
    this.$('.game-name').textContent = id ? t.name : 'No puzzle on this page';
    this.$('.pill-name').textContent = id ? t.name : 'LarpedIn';
    this.renderSettings();
  }

  setSettings(s: Settings) {
    this.settings = s;
    (this.$('#ll-auto') as HTMLInputElement).checked = s.auto;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('.seg input')) {
      input.checked = (s as any)[input.name] === input.value;
    }
  }

  setStatus(s: Status) {
    if (s.phase === 'error') this.errStep = ACTIVE_STEP[this.status.phase] ?? this.errStep;
    this.status = s;
    this.renderStatus();
  }

  // ---------- rendering ----------

  private template(): string {
    const steps = STEPS.map((s) => `<div class="step" data-step="${s}"><span class="bar"></span>${s}</div>`).join('');
    return `<style>${CSS}</style>
<section class="card" role="region" aria-label="${BRAND.name} solver" data-phase="idle">
  <header class="head" title="Drag to move">
    <span class="mark">${markSvg(28)}</span>
    <div class="titles">
      <span class="brand">${BRAND.name}</span>
      <span class="game"><i class="dot"></i><span class="game-name">LinkedIn games</span></span>
    </div>
    <button class="icon" id="ll-gear" type="button" aria-label="Settings" aria-expanded="false" aria-controls="ll-settings">${ICON.gear}</button>
    <button class="icon" id="ll-min" type="button" aria-label="Collapse panel" title="Collapse (Esc)">${ICON.minimize}</button>
  </header>
  <div class="body">
    <div class="status">
      <div class="steps" aria-hidden="true">${steps}</div>
      <p class="msg" role="status" aria-live="polite"><span class="ic ok">${ICON.check}</span><span class="ic err">${ICON.alert}</span><span class="msg-text"></span></p>
      <dl class="times" hidden>
        <div><dt>Read</dt><dd data-t="read"></dd></div>
        <div><dt>Solve</dt><dd data-t="solve"></dd></div>
        <div><dt>Play</dt><dd data-t="play"></dd></div>
      </dl>
      <div class="err-actions" hidden>
        <button class="ghost" id="ll-copy" type="button">${ICON.copy}<span>Copy debug info</span></button>
      </div>
    </div>
    <button class="solve" id="ll-solve" type="button" aria-keyshortcuts="Alt+S">
      <span class="solve-label">Solve</span><span aria-hidden="true"><kbd>Alt</kbd> <kbd>S</kbd></span>
    </button>
    <div class="row">
      <label for="ll-auto"><span>Auto-solve<span class="sub">Solve as soon as a new board appears</span></span>
        <input type="checkbox" role="switch" class="switch" id="ll-auto"></label>
    </div>
    <div class="settings" id="ll-settings" hidden>
      <h3 class="settings-title"></h3>
      <div class="game-settings"></div>
      <div class="foot">
        <button class="ghost" id="ll-export" type="button">${ICON.download}<span>Export puzzles</span></button>
        <span>Not affiliated with LinkedIn</span>
      </div>
    </div>
  </div>
</section>
<button class="pill" type="button" data-phase="idle" aria-label="Open ${BRAND.name} panel" title="Click to open, drag to move" hidden>
  <span class="mark">${markSvg(28)}</span><span class="pill-name">LarpedIn</span><span class="state" aria-hidden="true"></span>
  <span class="sr pill-status"></span>
</button>`;
  }

  private renderSettings() {
    const t = gameTheme(this.game);
    this.$('.settings-title').textContent = `${this.game ? t.name : 'Game'} settings`;
    const list = (this.game && GAME_SETTINGS[this.game]) || [];
    this.$('.game-settings').innerHTML = list.length
      ? list.map((s) => `<fieldset><legend>${esc(s.label)} <span class="sub">${esc(s.hint)}</span></legend><div class="seg">${
        s.options.map((o) => `<label><input type="radio" name="${s.key}" value="${esc(o.value)}"${
          (this.settings as any)[s.key] === o.value ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')
      }</div></fieldset>`).join('')
      : `<p class="none">Nothing to tune for ${esc(t.name)}: it just works.</p>`;
  }

  private renderStatus() {
    const s = this.status;
    const card = this.$('.card');
    card.dataset.phase = s.phase;
    this.$('.pill').dataset.phase = s.phase;
    const active = ACTIVE_STEP[s.phase];
    this.root.querySelectorAll<HTMLElement>('.step').forEach((el, i) => {
      let st = 'idle';
      if (s.phase === 'done') st = 'done';
      else if (s.phase === 'error') st = i < this.errStep ? 'done' : i === this.errStep ? 'error' : 'idle';
      else if (active !== undefined) st = i < active ? 'done' : i === active ? 'active' : 'idle';
      el.dataset.s = st;
    });
    const msg = s.message ?? defaultMessage(s.phase);
    this.$('.msg-text').textContent = msg;
    this.$('.pill-status').textContent = msg;
    const times = this.$('.times');
    times.hidden = !(s.phase === 'done' && s.timings);
    if (s.timings) {
      for (const k of ['read', 'solve', 'play'] as const) {
        this.$(`[data-t="${k}"]`).textContent = fmtMs(s.timings[k]);
      }
    }
    this.$('.err-actions').hidden = s.phase !== 'error';
    const busy = s.phase === 'reading' || s.phase === 'solving' || s.phase === 'playing';
    const btn = this.$('#ll-solve');
    btn.setAttribute('aria-disabled', String(busy));
    this.$('.solve-label').textContent = busy ? 'Solving…' : s.phase === 'error' ? 'Try again' : 'Solve';
  }

  // ---------- behaviour ----------

  private wire() {
    this.$('#ll-solve').addEventListener('click', () => {
      if (this.$('#ll-solve').getAttribute('aria-disabled') !== 'true') this.h.onSolve();
    });
    this.$('#ll-auto').addEventListener('change', (e) =>
      this.h.onSettings({ auto: (e.target as HTMLInputElement).checked }));
    this.$('.game-settings').addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'radio') this.h.onSettings({ [t.name]: t.value } as Partial<Settings>);
    });
    const gear = this.$('#ll-gear');
    gear.addEventListener('click', () => {
      const open = gear.getAttribute('aria-expanded') !== 'true';
      gear.setAttribute('aria-expanded', String(open));
      this.$('#ll-settings').hidden = !open;
      this.position(false);
    });
    this.$('#ll-export').addEventListener('click', () => this.h.onExport());
    this.$('#ll-copy').addEventListener('click', async () => {
      const label = this.$('#ll-copy span');
      try {
        await navigator.clipboard.writeText(this.h.debugInfo());
        label.textContent = 'Copied';
      } catch {
        // Clipboard can be blocked; fall back to the console.
        console.log('[LarpedIn] debug info\n' + this.h.debugInfo());
        label.textContent = 'Printed to console';
      }
      setTimeout(() => { label.textContent = 'Copy debug info'; }, 1800);
    });
    this.$('#ll-min').addEventListener('click', () => this.setCollapsed(true));
    this.$('.card').addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') this.setCollapsed(true);
    });
    // Keep key presses inside the panel from reaching LinkedIn's handlers.
    for (const t of ['keydown', 'keyup', 'keypress']) {
      this.root.addEventListener(t, (e) => {
        const k = e as KeyboardEvent;
        if (!(k.altKey && k.code === 'KeyS')) e.stopPropagation();
      });
    }
    this.draggable(this.$('.head'), null);
    const pill = this.$('.pill');
    this.draggable(pill, () => this.setCollapsed(false));
  }

  /** Pointer-drag `handle` to move the panel; a press without movement calls `onTap`. */
  private draggable(handle: HTMLElement, onTap: (() => void) | null) {
    let start: { x: number; y: number; left: number; bottom: number; id: number } | null = null;
    let moved = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (onTap === null && (e.target as Element).closest('button'))) return;
      start = { x: e.clientX, y: e.clientY, left: this.place.left, bottom: this.place.bottom, id: e.pointerId };
      moved = false;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      this.place.left = start.left + dx;
      this.place.bottom = start.bottom - dy;
      this.position(false);
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      if (moved) this.position(true);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    if (onTap) {
      handle.addEventListener('click', (e) => {
        if (moved) { e.preventDefault(); moved = false; return; }
        onTap();
      });
    }
  }

  private setCollapsed(c: boolean) {
    this.place.collapsed = c;
    this.applyCollapsed(true);
    savePlace(this.place);
    this.position(false);
  }

  private applyCollapsed(focus: boolean) {
    const c = this.place.collapsed;
    this.$('.card').hidden = c;
    this.$('.pill').hidden = !c;
    if (focus) (c ? this.$('.pill') : this.$('#ll-solve')).focus();
  }

  /** Apply place to the host, clamped so it stays on screen. */
  private position(save: boolean) {
    const w = this.host.offsetWidth || 280, h = this.host.offsetHeight || 200;
    const maxL = Math.max(MARGIN, innerWidth - w - MARGIN);
    const maxB = Math.max(MARGIN, innerHeight - h - MARGIN);
    this.place.left = Math.min(Math.max(MARGIN, this.place.left), maxL);
    this.place.bottom = Math.min(Math.max(MARGIN, this.place.bottom), maxB);
    this.host.style.setProperty('left', `${this.place.left}px`, 'important');
    this.host.style.setProperty('bottom', `${this.place.bottom}px`, 'important');
    if (save) savePlace(this.place);
  }
}

function defaultMessage(p: Phase): string {
  switch (p) {
    case 'idle': return 'Ready. Press Solve when the board is open.';
    case 'reading': return 'Reading the board…';
    case 'solving': return 'Solving…';
    case 'playing': return 'Playing the answer…';
    case 'done': return 'Solved.';
    case 'error': return 'Something went wrong.';
  }
}
