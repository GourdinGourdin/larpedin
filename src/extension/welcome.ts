/// <reference types="chrome" />
// Welcome page (opened on install) that doubles as the options page.
import { GAMEDIN_URL, gamedinMarkSvg } from '../page/theme.ts';
import { sanitizeSettings, type Settings } from '../page/settings.ts';
import {
  applyTheme, gameList, getSettings, injectTheme, kbdHtml, canChangeShortcut, openShortcutSettings, patchSettings, settingsFieldsHtml, solveShortcut,
} from './common.ts';

injectTheme();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
$('ver').textContent = `v${chrome.runtime.getManifest().version}`;

$('games').innerHTML = gameList().map(([id, t]) =>
  `<a class="card game g-${id}" href="${t.url}" target="_blank" rel="noopener">` +
  `<h3>${t.name}<span class="open">Open ↗</span></h3><p>${t.blurb}</p></a>`).join('');

$<HTMLAnchorElement>('gamedin').href = GAMEDIN_URL;
$('gamedin').querySelector('.gm')!.innerHTML = gamedinMarkSvg(36);

let savedTimer = 0;
function flashSaved() {
  $('saved').classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => $('saved').classList.remove('on'), 1200);
}

function render(s: Settings) {
  $<HTMLInputElement>('auto').checked = s.auto;
  applyTheme(s.theme);
  for (const r of document.querySelectorAll<HTMLInputElement>('input[name="theme"]')) r.checked = r.value === s.theme;
  $('game-settings').innerHTML = settingsFieldsHtml(s);
}

getSettings().then(render);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'sync' && ch.settings) render(sanitizeSettings(ch.settings.newValue));
});

$('auto').addEventListener('change', (e) => patchSettings({ auto: (e.target as HTMLInputElement).checked }).then(flashSaved));
function onRadio(e: Event) {
  const t = e.target as HTMLInputElement;
  if (t.type === 'radio') patchSettings({ [t.name]: t.value } as Partial<Settings>).then(flashSaved);
}
$('game-settings').addEventListener('change', onRadio);
$('appearance').addEventListener('change', onRadio);

solveShortcut().then((s) => {
  $('shortcut').innerHTML = kbdHtml(s);
  $('kbd-inline').innerHTML = kbdHtml(s);
});
$('change-shortcut').hidden = !canChangeShortcut();
$('change-shortcut').addEventListener('click', openShortcutSettings);
