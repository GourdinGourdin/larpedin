/// <reference types="chrome" />
// Service worker: opens the welcome page on install and relays the
// "solve" keyboard command to the bridge in the active tab.
import type { RuntimeMsg } from '../page/settings.ts';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'solve') return;
  const id = tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (id === undefined) return;
  // No bridge in this tab (not LinkedIn): nothing to do.
  chrome.tabs.sendMessage(id, { type: 'larp:solve' } satisfies RuntimeMsg).catch(() => {});
});
