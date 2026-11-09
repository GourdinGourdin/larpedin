// Linkedin Larp visual identity: one place for the palette, so the in-page
// panel, the popup, the welcome page, the website and any video all match.
// Plain data only (no DOM), safe to import from Node scripts too.
import type { GameId } from './games.ts';

export const BRAND = {
  name: 'Linkedin Larp',
  tagline: 'Solves the daily LinkedIn puzzles for you, in milliseconds.',
  disclaimer: 'Not affiliated with, endorsed by or connected to LinkedIn.',
  shortcut: 'Alt+S',
} as const;

/** Base colours. Light is a warm cream; dark is a warm charcoal. */
export const BASE = {
  light: {
    bg: '#F6EFE2',        // page / pill background (cream)
    surface: '#FFFDF8',   // card
    surface2: '#F3ECDD',  // inset rows, chips
    border: '#E6DCCB',
    ink: '#2B2520',       // primary text, 14.9:1 on surface
    muted: '#6B6158',     // secondary text, 5.9:1 on surface
    focus: '#2B60A8',
    danger: '#B3261E',
    success: '#2E7D4F',
    shadow: '0 1px 2px rgba(43,37,32,.08), 0 8px 24px rgba(43,37,32,.14)',
  },
  dark: {
    bg: '#1F1B17',
    surface: '#26211D',
    surface2: '#2F2924',
    border: '#3D362F',
    ink: '#F4EEE4',
    muted: '#A89C8E',     // 5.9:1 on surface
    focus: '#7FA8EC',
    danger: '#F2867D',
    success: '#7CCB98',
    shadow: '0 1px 2px rgba(0,0,0,.4), 0 10px 28px rgba(0,0,0,.45)',
  },
} as const;

export interface GameTheme {
  /** Display name. */
  name: string;
  /** One-line rule of the game, for the welcome page and website. */
  blurb: string;
  /** URL of the daily puzzle. */
  url: string;
  /** Accent on light backgrounds; white text on it is >= 4.5:1. */
  accent: string;
  /** Accent on dark backgrounds; BASE.dark.bg text on it is >= 6:1. */
  accentDark: string;
}

/** Per-game accents: a warm, earthy-but-bright set that sits well on cream. */
export const GAME_THEME = {
  zip: {
    name: 'Zip', blurb: 'One path through every cell, numbers in order.',
    url: 'https://www.linkedin.com/games/zip/', accent: '#B84A17', accentDark: '#F08A55',
  },
  queens: {
    name: 'Queens', blurb: 'One queen per row, column and colour region.',
    url: 'https://www.linkedin.com/games/queens/', accent: '#6E46AD', accentDark: '#B596EA',
  },
  tango: {
    name: 'Tango', blurb: 'Balance suns and moons; follow the = and × signs.',
    url: 'https://www.linkedin.com/games/tango/', accent: '#1B7264', accentDark: '#5CC2AE',
  },
  patches: {
    name: 'Patches', blurb: 'Cut the grid into rectangles that match each clue.',
    url: 'https://www.linkedin.com/games/patches/', accent: '#B03558', accentDark: '#F07C9C',
  },
  wend: {
    name: 'Wend', blurb: 'The newest daily puzzle.',
    url: 'https://www.linkedin.com/games/wend/', accent: '#2B60A8', accentDark: '#7FA8EC',
  },
} satisfies Record<GameId | 'wend', GameTheme>;

/** Neutral accent used when no game is detected. */
export const BRAND_ACCENT = { accent: '#2B2520', accentDark: '#F4EEE4' } as const;

export function gameTheme(id: string | null | undefined): GameTheme {
  const t = id ? (GAME_THEME as Record<string, GameTheme>)[id] : undefined;
  if (t) return t;
  const name = id ? id[0].toUpperCase() + id.slice(1) : 'LinkedIn games';
  return { name, blurb: '', url: `https://www.linkedin.com/games/${id ?? ''}`, ...BRAND_ACCENT };
}

/** CSS custom properties for the base palette, light by default and dark under prefers-color-scheme. */
export function baseCssVars(selector = ':host'): string {
  const decl = (p: Record<string, string>) =>
    Object.entries(p).map(([k, v]) => `--ll-${k}:${v};`).join('');
  return `${selector}{${decl(BASE.light)}}` +
    `@media (prefers-color-scheme: dark){${selector}{${decl(BASE.dark)}}}`;
}

/** The brand mark as an SVG string (also the source of the toolbar icons). */
export function markSvg(size = 24, title = '', simple = size <= 20): string {
  // A rounded charcoal tile and one path that snakes, Zip-style, on a 3x3 grid
  // through all nine cells to a bright end dot: "solved". Tiny sizes get
  // slightly bolder ends so it stays legible.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>` +
    `<rect x="2" y="2" width="60" height="60" rx="16" fill="#2B2520"/>` +
    `<path d="M18 18 V46 H32 V18 H46 V46" fill="none" stroke="#F6EFE2" stroke-width="${simple ? 8 : 7}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="18" cy="18" r="${simple ? 7 : 6}" fill="#F6EFE2"/><circle cx="46" cy="46" r="${simple ? 8.5 : 7}" fill="#F08A55"/>` +
    `</svg>`;
}
