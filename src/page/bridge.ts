/// <reference types="chrome" />
// Isolated-world content script: the only part of the in-page code that can
// use chrome.* APIs. It relays between the page script (main world, via
// window.postMessage) and the extension (chrome.storage, popup, shortcut).
//
// The page's own scripts can post to this window too, so every message is
// shape-checked and settings are sanitized; the worst a forged message can do
// is change a solver setting or ask for a solve, both of which the page script
// (same world as LinkedIn) can be made to do anyway.
import {
  FROM_BRIDGE, FROM_PAGE, sanitizeSettings,
  type BridgeMsg, type PageMsg, type RuntimeMsg, type Status,
} from './settings.ts';

type BridgeBody = BridgeMsg extends infer M ? M extends BridgeMsg ? Omit<M, 'source'> : never : never;
const post = (m: BridgeBody) => window.postMessage({ source: FROM_BRIDGE, ...m }, location.origin);

let lastStatus: Status | null = null;

async function stored() {
  const { settings } = await chrome.storage.sync.get('settings');
  return settings === undefined ? null : sanitizeSettings(settings);
}

window.addEventListener('message', async (e) => {
  if (e.source !== window) return;
  const m = e.data as PageMsg;
  if (!m || m.source !== FROM_PAGE) return;
  if (m.type === 'hello') {
    // Stored settings win; on first run seed storage from the page's localStorage.
    const s = await stored();
    if (s) post({ type: 'settings', settings: s });
    else await chrome.storage.sync.set({ settings: sanitizeSettings(m.settings) });
  } else if (m.type === 'settings') {
    await chrome.storage.sync.set({ settings: sanitizeSettings(m.settings) });
  } else if (m.type === 'status' && m.status && typeof m.status.phase === 'string') {
    lastStatus = m.status;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) post({ type: 'settings', settings: sanitizeSettings(changes.settings.newValue) });
});

chrome.runtime.onMessage.addListener((msg: RuntimeMsg, _sender, reply) => {
  if (msg?.type === 'larp:status') reply({ status: lastStatus, path: location.pathname });
  else if (msg?.type === 'larp:solve') { post({ type: 'solve' }); reply({ ok: true }); }
});

// The page script may have loaded first and said hello to nobody.
post({ type: 'hello' });
