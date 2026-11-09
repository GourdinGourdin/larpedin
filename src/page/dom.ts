// Helpers for reading LinkedIn's game board from the page and sending input.
// Runs in the page's main world (React internals are not visible to an
// isolated content script).

export const GRID_SEL = '[data-testid="interactive-grid"]';

export function getGrid(): HTMLElement | null {
  return document.querySelector<HTMLElement>(GRID_SEL);
}

export function getCells(grid: HTMLElement): HTMLElement[] {
  const cells = [...grid.querySelectorAll<HTMLElement>('[data-cell-idx]')];
  return cells.sort((a, b) => +a.dataset.cellIdx! - +b.dataset.cellIdx!);
}

/** Props of the React component that renders this cell (static puzzle data). */
export function cellComponentProps(el: Element): any {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  if (!key) throw new Error('React fiber not found: is the script running in the page world?');
  return (el as any)[key].return.memoizedProps;
}

/** Walk up from the grid to find {gridRows, gridCols}. */
export function gridDims(grid: HTMLElement): { rows: number; cols: number } | null {
  const key = Object.keys(grid).find((k) => k.startsWith('__reactFiber'));
  let f = key ? (grid as any)[key] : null;
  for (let i = 0; f && i < 8; i++, f = f.return) {
    const p = f.memoizedProps;
    if (p && typeof p.gridRows === 'number' && typeof p.gridCols === 'number') {
      return { rows: p.gridRows, cols: p.gridCols };
    }
  }
  return null;
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
}

export function mouse(el: Element, type: 'mousedown' | 'mousemove' | 'mouseup' | 'click') {
  const { clientX, clientY } = center(el);
  el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX, clientY, screenX: clientX, screenY: clientY,
    button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1,
  }));
}

export function tap(el: Element) {
  mouse(el, 'mousedown');
  mouse(el, 'mouseup');
  mouse(el, 'click');
}

/** Press-drag-release through a list of cells. */
export function drag(cells: Element[]) {
  mouse(cells[0], 'mousedown');
  for (let i = 1; i < cells.length; i++) mouse(cells[i], 'mousemove');
  mouse(cells[cells.length - 1], 'mouseup');
}

export function key(el: HTMLElement, k: string) {
  el.focus();
  const code = k === 'Enter' ? 13 : k === ' ' ? 32 : 0;
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, keyCode: code, which: code, bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: k, keyCode: code, which: code, bubbles: true, cancelable: true }));
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

// ---------- Zip input helpers (pointer + mouse drags, fresh React state) ----------

type PointerKind = 'down' | 'move' | 'up';

/**
 * Fire the pointer event, then the matching mouse event, at the centre of
 * `el`, the way a real mouse does. The target is the element actually at that
 * point (if it is inside `el`), so handlers see what a real cursor would give.
 */
export function pointerMouse(el: Element, kind: PointerKind) {
  const { clientX, clientY } = center(el);
  const hit = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(clientX, clientY) : null;
  const target = hit && el.contains(hit) ? hit : el;
  const buttons = kind === 'up' ? 0 : 1;
  const base = {
    bubbles: true, cancelable: true, composed: true, view: window,
    clientX, clientY, screenX: clientX, screenY: clientY, buttons,
  };
  if (typeof PointerEvent === 'function') {
    target.dispatchEvent(new PointerEvent(`pointer${kind}`, {
      ...base, button: kind === 'move' ? -1 : 0,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1, pressure: buttons ? 0.5 : 0,
    }));
  }
  target.dispatchEvent(new MouseEvent(`mouse${kind}`, { ...base, button: 0 }));
}

/** Positions in `path` (cell indices) where the direction changes, plus the last position. */
export function turnPoints(path: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < path.length - 1; i++) {
    if (path[i] - path[i - 1] !== path[i + 1] - path[i]) out.push(i);
  }
  if (path.length > 1) out.push(path.length - 1);
  return out;
}

/**
 * Press on `cells[path[0]]`, move through the path, release on the last cell,
 * with pointer and mouse events. `turnsOnly` moves only to the cells where the
 * path turns; the default visits every cell, which is safest if the game only
 * accepts steps to an adjacent cell.
 */
export function dragPath(cells: Element[], path: number[], turnsOnly = false) {
  if (!path.length) return;
  const stops = turnsOnly ? turnPoints(path) : path.map((_, i) => i).slice(1);
  pointerMouse(cells[path[0]], 'down');
  for (const i of stops) pointerMouse(cells[path[i]], 'move');
  pointerMouse(cells[path[path.length - 1]], 'up');
}

/**
 * Props of the component that renders `el`, read through both the fiber on the
 * DOM node and its alternate. After an update the node may still point at the
 * stale copy, so callers should look at every candidate.
 */
export function cellPropsCandidates(el: Element): any[] {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  if (!key) return [];
  const f = (el as any)[key];
  const out: any[] = [];
  for (const fiber of [f, f?.alternate]) {
    for (const owner of [fiber?.return, fiber?.return?.alternate]) {
      const p = owner?.memoizedProps;
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
