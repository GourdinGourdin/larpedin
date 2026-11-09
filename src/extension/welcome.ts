/// <reference types="chrome" />
// Welcome page (opened on install) that doubles as the options page.
import { sanitizeSettings, type Settings } from '../page/settings.ts';
import {
  gameList, getSettings, injectTheme, kbdHtml, openShortcutSettings, patchSettings, settingsFieldsHtml, solveShortcut,
} from './common.ts';

injectTheme();
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
$('ver').textContent = `v${chrome.runtime.getManifest().version}`;

$('stripe').innerHTML = gameList().map(([id]) => `<span class="g-${id}"></span>`).join('');
$('games').innerHTML = gameList().map(([id, t]) =>
  `<a class="card game g-${id}" href="${t.url}" target="_blank" rel="noopener">` +
  `<h3>${t.name}<span class="open">Open ↗</span></h3><p>${t.blurb}</p></a>`).join('');

let savedTimer = 0;
function flashSaved() {
  $('saved').classList.add('on');
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => $('saved').classList.remove('on'), 1200);
}

function render(s: Settings) {
  $<HTMLInputElement>('auto').checked = s.auto;
  $('game-settings').innerHTML = settingsFieldsHtml(s);
}

getSettings().then(render);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'sync' && ch.settings) render(sanitizeSettings(ch.settings.newValue));
});

$('auto').addEventListener('change', (e) => patchSettings({ auto: (e.target as HTMLInputElement).checked }).then(flashSaved));
$('game-settings').addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.type === 'radio') patchSettings({ [t.name]: t.value } as Partial<Settings>).then(flashSaved);
});

solveShortcut().then((s) => {
  $('shortcut').innerHTML = kbdHtml(s);
  $('kbd-inline').innerHTML = kbdHtml(s);
});
$('change-shortcut').addEventListener('click', openShortcutSettings);
