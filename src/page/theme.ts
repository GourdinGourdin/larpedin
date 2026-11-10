// LarpedIn visual identity: one place for the palette, so the in-page
// panel, the popup, the welcome page, the website and any video all match.
// Plain data only (no DOM), safe to import from Node scripts too.
import type { GameId } from './games.ts';

export const BRAND = {
  name: 'LarpedIn',
  tagline: 'Solves the daily LinkedIn puzzles for you, in milliseconds.',
  disclaimer: 'Not affiliated with, endorsed by or connected to LinkedIn.',
  shortcut: 'Alt+S',
} as const;

/**
 * Base colours, shared with GamedIn (see the spec in the sister repo): a warm
 * cream by day, a warm night (never blue-black) after dark.
 */
export const BASE = {
  light: {
    bg: '#F7F0E1',        // page background (cream)
    surface: '#FFFBF3',   // card
    surface2: '#F7F0E1',  // inset rows, chips (same cream as the page)
    cell: '#FFFDF8',
    cell2: '#E9E0CD',
    border: '#E4D9C4',
    ink: '#231E18',       // primary text
    ink2: '#4E463B',      // secondary text
    muted: '#736A5C',     // 4.7:1 on bg, 5.2:1 on surface
    focus: '#231E18',
    danger: '#BF3626',    // GamedIn's #D23F2E, darkened for text: >= 4.5:1 on bg and surface
    success: '#156E55',
    shadow: '0 1px 0 rgba(35,30,24,.06), 0 10px 28px rgba(35,30,24,.16)',
  },
  dark: {
    bg: '#17130F',
    surface: '#221D18',
    surface2: '#2A241E',
    cell: '#2A241E',
    cell2: '#3D352C',
    border: '#372F27',
    ink: '#F3EBDD',
    ink2: '#D0C5B3',
    muted: '#9A8F7F',     // 5.3:1 on surface, 4.8:1 on surface2
    focus: '#F3EBDD',
    danger: '#FF7A63',
    success: '#3AB18E',
    shadow: '0 1px 0 rgba(0,0,0,.35), 0 12px 32px rgba(0,0,0,.5)',
  },
} as const;

/** Fixed colours of the logo (an icon, so it never inverts). */
export const MARK_COLORS = { tile: '#231E18', cream: '#F7F0E1', orange: '#EC6A2E' } as const;

export interface GameTheme {
  /** Display name. */
  name: string;
  /** One-line rule of the game, for the welcome page and website. */
  blurb: string;
  /** URL of the daily puzzle. */
  url: string;
  /** Accent on light backgrounds. Text on it is `onAccent` (AA). */
  accent: string;
  /** Accent on dark backgrounds; BASE.dark.bg text on it is >= 6:1. */
  accentDark: string;
  /** Text colour on `accent` (light mode). Dark mode always uses BASE.dark.bg. */
  onAccent: string;
  /** The same hue, dark enough to be coloured text (>= 4.5:1) on light backgrounds. */
  ink: string;
}

/**
 * Per-game accents. Each game shares its colour with the GamedIn game it
 * resembles: Zip = Trace, Queens = Crowns, Tango = Pairs, Patches = Plots,
 * Wend = Wind. Zip's orange is too light for white text, so it takes ink.
 */
export const GAME_THEME = {
  zip: {
    name: 'Zip', blurb: 'One path through every cell, numbers in order.',
    url: 'https://www.linkedin.com/games/zip/', accent: '#EC6A2E', accentDark: '#F27C42', onAccent: '#231E18', ink: '#B04C1C',
  },
  queens: {
    name: 'Queens', blurb: 'One queen per row, column and colour region.',
    url: 'https://www.linkedin.com/games/queens/', accent: '#7650DE', accentDark: '#A68DF2', onAccent: '#FFFFFF', ink: '#6440C8',
  },
  tango: {
    name: 'Tango', blurb: 'Balance suns and moons; follow the = and × signs.',
    url: 'https://www.linkedin.com/games/tango/', accent: '#2C6BD3', accentDark: '#5D94EE', onAccent: '#FFFFFF', ink: '#2459B5',
  },
  patches: {
    name: 'Patches', blurb: 'Cut the grid into rectangles that match each clue.',
    url: 'https://www.linkedin.com/games/patches/', accent: '#1A8466', accentDark: '#3AB18E', onAccent: '#FFFFFF', ink: '#156E55',
  },
  wend: {
    name: 'Wend', blurb: 'Snaking words that use every tile once.',
    url: 'https://www.linkedin.com/games/wend/', accent: '#CC3B75', accentDark: '#EC6B9A', onAccent: '#FFFFFF', ink: '#A92C5F',
  },
} satisfies Record<GameId | 'wend', GameTheme>;

/** Neutral accent used when no game is detected. */
export const BRAND_ACCENT = { accent: BASE.light.ink, accentDark: BASE.dark.ink, onAccent: BASE.light.bg, ink: BASE.light.ink } as const;

export function gameTheme(id: string | null | undefined): GameTheme {
  const t = id ? (GAME_THEME as Record<string, GameTheme>)[id] : undefined;
  if (t) return t;
  const name = id ? id[0].toUpperCase() + id.slice(1) : 'LinkedIn games';
  return { name, blurb: '', url: `https://www.linkedin.com/games/${id ?? ''}`, ...BRAND_ACCENT };
}

/**
 * Wrap dark-mode rules for the Appearance setting. The scope element carries
 * data-theme="light" | "dark" | "auto": light (the default) needs no rules,
 * dark applies always, auto applies when the device prefers dark.
 * `rules` gets the scope selector to prefix each rule with.
 */
export function darkRules(scope: ':host' | ':root', rules: (scope: string) => string): string {
  const at = (v: string) => (scope === ':host' ? `:host([data-theme="${v}"])` : `:root[data-theme="${v}"]`);
  return `${rules(at('dark'))}@media (prefers-color-scheme:dark){${rules(at('auto'))}}`;
}

/** CSS custom properties for the base palette: light by default, dark per the data-theme attribute. */
export function baseCssVars(scope: ':host' | ':root' = ':host'): string {
  const decl = (p: Record<string, string>) =>
    Object.entries(p).map(([k, v]) => `--ll-${k}:${v};`).join('');
  return `${scope}{${decl(BASE.light)}}` + darkRules(scope, (s) => `${s}{${decl(BASE.dark)}}`);
}

/**
 * The brand mark as an SVG string (also the source of the toolbar icons and
 * the website logo): a cream masquerade mask on a charcoal tile, with orange
 * pupils and a small orange crown. Same family as GamedIn's mark.
 */
export function markSvg(size = 24, title = ''): string {
  const { tile, cream, orange } = MARK_COLORS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>` +
    `<rect width="64" height="64" rx="16" fill="${tile}"/>` +
    `<path d="M25.25 26 24.25 17.25 28.5 20.75 32 15 35.5 20.75 39.75 17.25 38.75 26Z" fill="${orange}" stroke="${orange}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M8 35Q8 26 17 26Q26 26 32 31Q38 26 47 26Q56 26 56 35Q56 48 46 49.5Q38 50.5 32 43.5Q26 50.5 18 49.5Q8 48 8 35Z" fill="${cream}"/>` +
    `<rect x="14" y="32.5" width="12" height="9" rx="3.5" fill="${tile}"/><rect x="38" y="32.5" width="12" height="9" rx="3.5" fill="${tile}"/>` +
    `<circle cx="20" cy="37" r="2.7" fill="${orange}"/><circle cx="44" cy="37" r="2.7" fill="${orange}"/>` +
    `</svg>`;
}

/** Sister project. One constant, so a URL change is a one-line edit. */
export const GAMEDIN_URL = 'https://gourdingourdin.github.io/gamedin/';

/** GamedIn's logo (a 2x2 board of its game pieces), for the cross-promo. */
export function gamedinMarkSvg(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">` +
    `<rect width="64" height="64" rx="16" fill="#231E18"/><rect x="9" y="9" width="21.5" height="21.5" rx="6" fill="#7650DE"/>` +
    `<path d="M13 25.5 12 16.75 16.25 20.25 19.75 14.5 23.25 20.25 27.5 16.75 26.5 25.5Z" fill="#F7F0E1" stroke="#F7F0E1" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<rect x="33.5" y="9" width="21.5" height="21.5" rx="6" fill="#F7F0E1"/><circle cx="40.6" cy="16.1" r="4.3" fill="#F2A414"/>` +
    `<rect x="43.8" y="19.3" width="7.8" height="7.8" rx="2.2" fill="#2C6BD3"/><rect x="9" y="33.5" width="21.5" height="21.5" rx="6" fill="#F7F0E1"/>` +
    `<path d="M15 39.5H20.5Q24.5 39.5 24.5 43.5V49" fill="none" stroke="#EC6A2E" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="15" cy="39.5" r="3.4" fill="#231E18"/><rect x="33.5" y="33.5" width="21.5" height="21.5" rx="6" fill="#1A8466"/>` +
    `<rect x="38.6" y="38.6" width="11.3" height="11.3" rx="3" fill="#F7F0E1"/></svg>`;
}
