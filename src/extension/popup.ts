/// <reference types="chrome" />
// Toolbar popup: status of the active tab, quick links, auto-solve, shortcut.
import { gameTheme } from '../page/theme.ts';
import { fmtMs, sanitizeSettings, type RuntimeMsg, type Status } from '../page/settings.ts';
import { canChangeShortcut, gameList, getSettings, injectTheme, kbdHtml, openShortcutSettings, patchSettings, solveShortcut } from './common.ts';

injectTheme();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
$('ver').textContent = `v${chrome.runtime.getManifest().version}`;

let tabId: number | undefined;
let currentGameId: string | null = null;

// ---------- games ----------
function renderGames() {
  $('games').innerHTML = gameList().map(([id, t]) =>
    `<a class="g-${id}" href="${t.url}" data-game="${id}"${id === currentGameId ? ' aria-current="page"' : ''}>` +
    `<span class="dot"></span>${t.name}</a>`).join('');
}
$('games').addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a');
  if (!a) return;
  e.preventDefault();
  // Reuse the current tab when it is already on LinkedIn, otherwise open a new one.
  if (tabId !== undefined && onLinkedIn) chrome.tabs.update(tabId, { url: a.href });
  else chrome.tabs.create({ url: a.href });
  window.close();
});

// ---------- status ----------
let onLinkedIn = false;
function renderStatus(status: Status | null, reachable: boolean) {
  const box = $('status');
  const title = $('status-title'), detail = $('status-detail'), solve = $<HTMLButtonElement>('solve');
  onLinkedIn = reachable;
  const game = status?.game ?? null;
  if (game !== currentGameId) { currentGameId = game; renderGames(); }
  box.className = `card status${game ? ` on-game g-${game}` : ''}`;
  box.dataset.phase = status?.phase ?? 'idle';
  solve.hidden = !game;
  solve.disabled = !!status && ['reading', 'solving', 'playing'].includes(status.phase);
  solve.textContent = status?.phase === 'done' ? 'Solve again' : status?.phase === 'error' ? 'Try again' : 'Solve now';
  if (!reachable) {
    title.textContent = 'Not on a LinkedIn puzzle';
    detail.textContent = 'Pick a game below. If LinkedIn is already open, reload that tab once after installing.';
    return;
  }
  if (!game) {
    title.textContent = 'LinkedIn is open';
    detail.textContent = 'Pick a game below to open today\'s puzzle.';
    return;
  }
  const name = gameTheme(game).name;
  switch (status!.phase) {
    case 'done':
      title.textContent = `${name} solved`;
      detail.textContent = status!.timings
        ? `Read ${fmtMs(status!.timings.read)}, solve ${fmtMs(status!.timings.solve)}, play ${fmtMs(status!.timings.play)}`
        : status!.message ?? '';
      break;
    case 'error':
      title.textContent = `${name}: something went wrong`;
      detail.textContent = status!.message ?? 'Open the panel on the page to copy debug info.';
      break;
    case 'idle':
      title.textContent = `${name} is ready`;
      detail.textContent = status!.message ?? 'Press Solve now, or use the shortcut on the page.';
      break;
    default:
      title.textContent = `${name}: ${status!.phase}…`;
      detail.textContent = '';
  }
}

async function refresh() {
  if (tabId === undefined) return renderStatus(null, false);
  try {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'larp:status' } satisfies RuntimeMsg);
    renderStatus(r?.status ?? null, true);
  } catch {
    renderStatus(null, false);
  }
}

$('solve').addEventListener('click', async () => {
  if (tabId === undefined) return;
  await chrome.tabs.sendMessage(tabId, { type: 'larp:solve' } satisfies RuntimeMsg).catch(() => {});
  setTimeout(refresh, 50);
});

// ---------- settings ----------
const auto = $<HTMLInputElement>('auto');
getSettings().then((s) => { auto.checked = s.auto; });
auto.addEventListener('change', () => patchSettings({ auto: auto.checked }));
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'sync' && ch.settings) auto.checked = sanitizeSettings(ch.settings.newValue).auto;
});

solveShortcut().then((s) => {
  $('shortcut').innerHTML = kbdHtml(s);
});
$('change-shortcut').hidden = !canChangeShortcut();
$('change-shortcut').addEventListener('click', openShortcutSettings);
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());

// ---------- go ----------
renderGames();
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  tabId = tab?.id;
  refresh();
  setInterval(refresh, 600);
});
