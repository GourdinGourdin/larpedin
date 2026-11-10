// Solved-board illustrations as standalone SVG strings, in the same style as
// the explainer video (video/scene.html): cream tiles, one accent per game.
// Used by scripts/site-art.ts to draw the website's game cards and hero.
// Plain data in, string out: safe to run in Node.
import { BASE, GAME_THEME } from '../page/theme.ts';

const P = { cell: BASE.light.surface2, ink: BASE.light.ink, dim: BASE.light.muted, card: BASE.light.surface };
const G = Object.fromEntries(Object.entries(GAME_THEME).map(([k, v]) => [k, v.accent])) as Record<keyof typeof GAME_THEME, string>;
const SUN = '#E39A2D';
const FONT = 'ui-rounded, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
const SIZE = 400;

export interface ArtData {
  zip: { rows: number; cols: number; numbers: Record<string, number>; walls: [number, string][]; path: number[] };
  queens: { size: number; regions: number[]; cols: number[] };
  tango: { size: number; given: Record<string, number>; edges: [number, number, string][]; solution: number[] };
  patches: { rows: number; cols: number; clues: { cell: number; shape: string; size: number }[]; rects: [number, number, number, number][] };
  wend: { size: number; letters: string[]; words: { word: string; cells: number[] }[] };
}

const f = (n: number) => +n.toFixed(2);
function hex(h: string) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function mix(a: string, b: string, k: number) {
  const x = hex(a), y = hex(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

function svg(label: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${label}">${body}</svg>\n`;
}
const center = (N: number, i: number): [number, number] => {
  const cs = SIZE / N;
  return [f((i % N) * cs + cs / 2), f(Math.floor(i / N) * cs + cs / 2)];
};
function tiles(N: number, fill: (i: number) => string = () => P.cell) {
  const cs = SIZE / N, gap = Math.max(4, cs * 0.08), s = f(cs - gap), r = f(cs * 0.16);
  let out = '';
  for (let i = 0; i < N * N; i++) {
    out += `<rect x="${f((i % N) * cs + gap / 2)}" y="${f(Math.floor(i / N) * cs + gap / 2)}" width="${s}" height="${s}" rx="${r}" fill="${fill(i)}"/>`;
  }
  return out;
}
const pathD = (N: number, cells: number[]) => cells.map((c, i) => `${i ? 'L' : 'M'}${center(N, c).join(' ')}`).join(' ');
const text = (x: number, y: number, size: number, fill: string, s: string, weight = 800) =>
  `<text x="${x}" y="${f(y + size * 0.35)}" font-family="${FONT}" font-size="${f(size)}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${s}</text>`;

export function zipSvg(z: ArtData['zip']) {
  const N = z.cols, cs = SIZE / N;
  let b = tiles(N);
  b += `<path d="${pathD(N, z.path)}" fill="none" stroke="${G.zip}" stroke-width="${f(cs * 0.42)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  for (const [c, d] of z.walls) {
    const r = Math.floor(c / N), q = c % N, w = f(Math.max(5, cs * 0.08));
    b += d === 'RIGHT'
      ? `<line x1="${f((q + 1) * cs)}" y1="${f(r * cs + 5)}" x2="${f((q + 1) * cs)}" y2="${f((r + 1) * cs - 5)}" stroke="${P.ink}" stroke-width="${w}" stroke-linecap="round"/>`
      : `<line x1="${f(q * cs + 5)}" y1="${f((r + 1) * cs)}" x2="${f((q + 1) * cs - 5)}" y2="${f((r + 1) * cs)}" stroke="${P.ink}" stroke-width="${w}" stroke-linecap="round"/>`;
  }
  for (const [c, s] of Object.entries(z.numbers)) {
    const [x, y] = center(N, +c);
    b += `<circle cx="${x}" cy="${y}" r="${f(cs * 0.28)}" fill="${P.ink}"/>` + text(x, y, cs * 0.3, '#fff', String(s + 1));
  }
  return svg('Zip: one path through every cell, numbers in order', b);
}

const QCOL = ['#F2C6B4', '#F4DFA6', '#CFE3BE', '#BFD9E4', '#D9CBEA', '#F0C9D8', '#D8D2C2', '#F5D3B3', '#C9DDD6', '#E3D3C4'];
function crown(cx: number, cy: number, s: number, color: string) {
  const p = [[-s, s * 0.55], [-s, -s * 0.35], [-s * 0.5, s * 0.05], [0, -s * 0.7], [s * 0.5, s * 0.05], [s, -s * 0.35], [s, s * 0.55]];
  return `<path d="${p.map(([x, y], i) => `${i ? 'L' : 'M'}${f(cx + x)} ${f(cy + y)}`).join(' ')} Z" fill="${color}" stroke="${color}" stroke-width="${f(s * 0.16)}" stroke-linejoin="round"/>`;
}
export function queensSvg(q: ArtData['queens']) {
  const N = q.size, cs = SIZE / N;
  let b = tiles(N, (i) => QCOL[q.regions[i] % QCOL.length]);
  q.cols.forEach((c, r) => { const [x, y] = center(N, r * N + c); b += crown(x, y + cs * 0.04, cs * 0.3, G.queens); });
  return svg('Queens: one queen per row, column and colour region', b);
}

export function tangoSvg(t: ArtData['tango']) {
  const N = t.size, cs = SIZE / N, given = mix(P.cell, P.ink, 0.08);
  let b = tiles(N, (i) => (i in t.given ? given : P.cell));
  t.solution.forEach((v, i) => {
    const [x, y] = center(N, i), r = f(cs * 0.26);
    if (v === 0) b += `<circle cx="${x}" cy="${y}" r="${r}" fill="${SUN}"/>`;
    else {
      // crescent: a disc with an offset disc masked out
      b += `<mask id="m${i}"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${f(x + r * 0.5)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.85)}" fill="#000"/></mask>` +
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${G.tango}" mask="url(#m${i})"/>`;
    }
  });
  for (const [a, c, kind] of t.edges) {
    const [ax, ay] = center(N, a), [bx, by] = center(N, c), mx = f((ax + bx) / 2), my = f((ay + by) / 2);
    b += `<circle cx="${mx}" cy="${my}" r="${f(cs * 0.21)}" fill="${P.card}" stroke="${P.cell}" stroke-width="2"/>` + text(mx, my - cs * 0.01, cs * 0.32, P.ink, kind === '=' ? '=' : '×');
  }
  return svg('Tango: balanced suns and moons, following the = and × clues', b);
}

export function patchesSvg(p: ArtData['patches']) {
  const N = p.cols, cs = SIZE / N;
  const shades = [0, 0.38, 0.16, 0.52, 0.26, 0.45, 0.08, 0.6].map((k, i) => (i % 2 ? mix(G.patches, '#FFFFFF', k) : mix(G.patches, P.ink, k * 0.45)));
  let b = tiles(N);
  p.rects.forEach(([t, l, h, w], i) => {
    b += `<rect x="${f(l * cs + 4)}" y="${f(t * cs + 4)}" width="${f(w * cs - 8)}" height="${f(h * cs - 8)}" rx="${f(cs * 0.18)}" fill="${shades[i % shades.length]}"/>`;
  });
  for (const c of p.clues) {
    const [x, y] = center(N, c.cell), s = cs * 0.5;
    const w = c.shape === 'VERTICAL' ? s * 0.62 : s, h = c.shape === 'HORIZONTAL' ? s * 0.62 : s;
    b += `<rect x="${f(x - w / 2)}" y="${f(y - h / 2)}" width="${f(w)}" height="${f(h)}" rx="5" fill="${P.card}"/>`;
    if (c.size) b += text(x, y, cs * 0.3, P.ink, String(c.size));
  }
  return svg('Patches: rectangles that match each clue', b);
}

export function wendSvg(w: ArtData['wend']) {
  const N = w.size, cs = SIZE / N;
  let b = tiles(N);
  w.words.forEach(({ cells }, i) => {
    const col = mix(G.wend, P.ink, [0, 0.18, 0.06, 0.26][i % 4]);
    b += `<path d="${pathD(N, cells)}" fill="none" stroke="${col}" stroke-width="${f(cs * 0.74)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  w.letters.forEach((L, i) => { if (L) { const [x, y] = center(N, i); b += text(x, y, cs * 0.36, '#fff', L); } });
  return svg(`Wend: the words ${w.words.map((x) => x.word).join(', ')} snaking through the grid`, b);
}

export function allBoards(d: ArtData) {
  return { zip: zipSvg(d.zip), queens: queensSvg(d.queens), tango: tangoSvg(d.tango), patches: patchesSvg(d.patches), wend: wendSvg(d.wend) };
}
