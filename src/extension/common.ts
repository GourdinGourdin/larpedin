/// <reference types="chrome" />
// Shared by the popup and the welcome/options page.
import { BASE, BRAND, GAME_THEME, baseCssVars, markSvg, type GameTheme } from '../page/theme.ts';
import { DEFAULT_SETTINGS, GAME_SETTINGS, sanitizeSettings, type Settings } from '../page/settings.ts';

/** Inject the palette as CSS variables (--ll-*) and per-game accent classes. */
export function injectTheme() {
  const games = Object.entries(GAME_THEME as Record<string, GameTheme>)
    .map(([id, t]) => `.g-${id}{--acc:${t.accent};--on-acc:${t.onAccent};--acc-ink:${t.ink}}@media (prefers-color-scheme:dark){.g-${id}{--acc:${t.accentDark};--on-acc:${BASE.dark.bg};--acc-ink:${t.accentDark}}}`)
    .join('');
  const style = document.createElement('style');
  style.textContent = baseCssVars(':root') +
    `:root{--acc:${BASE.light.ink};--on-acc:${BASE.light.bg};--acc-ink:${BASE.light.ink}}@media (prefers-color-scheme:dark){:root{--acc:${GAME_THEME.zip.accentDark};--on-acc:${BASE.dark.bg};--acc-ink:${GAME_THEME.zip.accentDark}}}` +
    games;
  document.head.prepend(style);
  for (const el of document.querySelectorAll<HTMLElement>('[data-mark]')) el.innerHTML = markSvg(+el.dataset.mark! || 32);
}

export const gameList = () => Object.entries(GAME_THEME as Record<string, GameTheme>);

export async function getSettings(): Promise<Settings> {
  try {
    const { settings } = await chrome.storage.sync.get('settings');
    return sanitizeSettings(settings);
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export async function patchSettings(patch: Partial<Settings>) {
  const s = await getSettings();
  await chrome.storage.sync.set({ settings: sanitizeSettings({ ...s, ...patch }) });
}

/**
 * The solve shortcut as Chrome has it bound. The page also listens for
 * Alt+S itself, so that is the answer when Chrome has no binding.
 */
export async function solveShortcut(): Promise<string> {
  try {
    const cmds = await chrome.commands.getAll();
    return cmds.find((c) => c.name === 'solve')?.shortcut || BRAND.shortcut;
  } catch { return BRAND.shortcut; }
}

/** Which browser family we run in, for the few places that differ. */
export function browserFamily(): 'firefox' | 'safari' | 'edge' | 'chromium' {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return 'safari';
  return 'chromium';
}

/** Can the user rebind the shortcut from here? (Safari has no such page.) */
export const canChangeShortcut = () => browserFamily() !== 'safari';

export function openShortcutSettings() {
  const fam = browserFamily();
  const cmds = chrome.commands as typeof chrome.commands & { openShortcutSettings?: () => Promise<void> };
  if (fam === 'firefox') {
    // Firefox 137+; older versions: Add-ons Manager > gear > Manage Extension Shortcuts.
    if (cmds.openShortcutSettings) { cmds.openShortcutSettings().catch(() => {}); return; }
    chrome.tabs.create({ url: 'about:addons' });
    return;
  }
  // Brave, Opera, Vivaldi and Arc all redirect chrome:// to their own pages.
  chrome.tabs.create({ url: fam === 'edge' ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Segmented radio controls for every per-game setting. */
export function settingsFieldsHtml(s: Settings, onlyGame?: string): string {
  return Object.entries(GAME_SETTINGS)
    .filter(([g]) => !onlyGame || g === onlyGame)
    .flatMap(([g, list]) => list.map((def) => {
      const t = (GAME_THEME as Record<string, GameTheme>)[g];
      return `<fieldset class="field g-${g}"><legend><span class="dot"></span>${esc(t?.name ?? g)}: ${esc(def.label)}` +
        `<span class="sub">${esc(def.hint)}</span></legend><div class="seg">` +
        def.options.map((o) => `<label><input type="radio" name="${def.key}" value="${esc(o.value)}"${
          (s as any)[def.key] === o.value ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('') +
        `</div></fieldset>`;
    })).join('');
}

/** Render shortcut text as <kbd> chips: "Alt+S" or "⌥S". */
export function kbdHtml(shortcut: string): string {
  const parts = shortcut.includes('+') ? shortcut.split('+') : [...shortcut];
  return parts.map((p) => `<kbd>${esc(p)}</kbd>`).join(' ');
}
