// Settings shared by the page script, the bridge, the popup and the welcome
// page, plus the message protocol between them. No DOM or chrome.* here.
//
//   popup / welcome ──chrome.storage.sync──▶ bridge (ISOLATED world)
//   bridge ──window.postMessage──▶ page script (MAIN world, localStorage mirror)
//   page ──postMessage──▶ bridge ──▶ chrome.storage / popup status
//
// The userscript build has no bridge: the page falls back to localStorage only.

export interface Settings {
  /** Solve as soon as an unsolved board appears. */
  auto: boolean;
  /** Zip: drag with the mouse (default) or step with the keyboard. */
  zipInput: 'mouse' | 'keyboard';
  /** Zip drag: pass through every cell (safest) or only the turns. */
  zipDrag: 'cells' | 'turns';
  /** Patches drag pacing (read by games.ts from localStorage['lgs-patches-pace']). */
  patchesPace: 'task' | 'sync' | 'frame';
}

export const DEFAULT_SETTINGS: Settings = {
  auto: false, zipInput: 'mouse', zipDrag: 'cells', patchesPace: 'task',
};

export interface ChoiceSetting {
  key: Exclude<keyof Settings, 'auto'>;
  label: string;
  hint: string;
  options: { value: string; label: string }[];
}

/** Per-game settings shown in the panel and on the welcome page. Games without an entry have none. */
export const GAME_SETTINGS: Record<string, ChoiceSetting[]> = {
  zip: [
    {
      key: 'zipInput', label: 'Input', hint: 'Switch to keys if dragging does not draw the path.',
      options: [{ value: 'mouse', label: 'Drag' }, { value: 'keyboard', label: 'Keys' }],
    },
    {
      key: 'zipDrag', label: 'Drag path', hint: 'Turns only is faster; every cell is safest.',
      options: [{ value: 'cells', label: 'Every cell' }, { value: 'turns', label: 'Turns only' }],
    },
  ],
  patches: [
    {
      key: 'patchesPace', label: 'Pace', hint: 'Slow down if some rectangles do not stick.',
      options: [{ value: 'sync', label: 'Instant' }, { value: 'task', label: 'Normal' }, { value: 'frame', label: 'Gentle' }],
    },
  ],
};

/** Keep only known keys with valid values; anything else falls back to the default. */
export function sanitizeSettings(x: unknown): Settings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof o.auto === 'boolean') out.auto = o.auto;
  for (const list of Object.values(GAME_SETTINGS)) {
    for (const s of list) {
      const v = o[s.key];
      if (typeof v === 'string' && s.options.some((opt) => opt.value === v)) (out as any)[s.key] = v;
    }
  }
  return out;
}

/** Duration for display: 0.04 ms, 3.2 ms, 48 ms, 1.24 s. */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  if (ms < 0.01) return '<0.01 ms';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

// ---------- page <-> bridge protocol ----------

export const FROM_PAGE = 'linkedin-larp/page';
export const FROM_BRIDGE = 'linkedin-larp/bridge';

export type Phase = 'idle' | 'reading' | 'solving' | 'playing' | 'done' | 'error';

export interface Timings { read: number; solve: number; play: number; total: number }

/** What the panel shows; mirrored to the popup. */
export interface Status {
  game: string | null;
  phase: Phase;
  message?: string;
  timings?: Timings;
}

export type PageMsg =
  | { source: typeof FROM_PAGE; type: 'hello'; settings: Settings }
  | { source: typeof FROM_PAGE; type: 'settings'; settings: Settings }
  | { source: typeof FROM_PAGE; type: 'status'; status: Status };

export type BridgeMsg =
  | { source: typeof FROM_BRIDGE; type: 'hello' }
  | { source: typeof FROM_BRIDGE; type: 'settings'; settings: Settings }
  | { source: typeof FROM_BRIDGE; type: 'solve' };

/** Messages between the popup/background and the bridge (chrome.runtime / chrome.tabs). */
export type RuntimeMsg = { type: 'larp:status' } | { type: 'larp:solve' };
