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
