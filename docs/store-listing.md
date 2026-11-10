# Store listing copy

Paste these into the store forms. The same words are used everywhere so the listings agree. URLs:

- Homepage: https://gourdingourdin.github.io/larpedin/
- Support: https://github.com/GourdinGourdin/larpedin/issues
- Privacy policy: https://github.com/GourdinGourdin/larpedin#privacy
- Category: Fun (Chrome), Games or Other (Firefox), Entertainment (Edge), Utilities (Apple)

## Name

LarpedIn

## Short description (Chrome and Edge, 132 characters at most)

Solves LinkedIn's daily Zip, Queens, Tango, Patches and Wend puzzles right on the page. Not affiliated with LinkedIn.

## Summary (Firefox, 250 characters at most)

Reads LinkedIn's daily Zip, Queens, Tango, Patches and Wend boards, solves them with exact solvers in milliseconds and plays the answer for you. Runs in your browser only. Not affiliated with LinkedIn.

## Long description

LarpedIn solves LinkedIn's daily puzzle games for you, right on the page.

Open Zip, Queens, Tango, Patches or Wend on linkedin.com/games and a small card appears in the corner. Press Solve (or Alt+S) and LarpedIn reads the board, finds the answer and plays it by clicking and dragging, the way you would.

How it works
- Reads the board the page already holds, so reading takes about no time.
- Solves it with exact search solvers, not guesses. The answer is always valid and takes milliseconds.
- Plays the answer with mouse events on the grid and checks that the board accepted it.
- Shows what each step took, and on a failure says which step failed and offers a debug report you can copy.

Features
- All five games: Zip, Queens, Tango, Patches and Wend.
- Auto-solve: solve as soon as a new board appears (off by default).
- Keyboard shortcut Alt+S, which you can change in your browser's shortcut settings.
- A toolbar popup with the status of the current tab, a Solve now button and quick links to each game.
- Light cream theme by default, plus Dark and Match device in the settings.
- Per-game tuning (Zip input and drag path, Patches pace) if a game changes.

Private by design
- No account, no server, no analytics, no tracking.
- Everything runs in your browser. Settings sync through your browser's own sync storage.
- Only runs on https://www.linkedin.com/.

LarpedIn is an independent fan project. It is not affiliated with, endorsed by or connected to LinkedIn Corporation. LinkedIn and the game names belong to their owners. Using automation on LinkedIn may be against its terms: you decide whether to use it.

Want more than one puzzle a day? Try GamedIn: https://gourdingourdin.github.io/gamedin/

## Single purpose (Chrome)

LarpedIn has one purpose: to solve LinkedIn's daily puzzle games (Zip, Queens, Tango, Patches, Wend) for the user, on the game pages at linkedin.com/games.

## Permission justifications

- **storage**: saves the user's settings (auto-solve, appearance, per-game options) and syncs them between the popup, the options page and open LinkedIn tabs. Nothing else is stored, and nothing leaves the browser.
- **Host access to https://www.linkedin.com/\* (content scripts)**: the extension has to read the puzzle board on LinkedIn's game pages and click on it. It does nothing on other sites and does not read anything outside the game board.
- **web_accessible_resources (content.js, linkedin.com only)**: a fallback for browsers that ignore the `world: "MAIN"` content-script setting, so the page script can be injected into the page itself, where the board's data is readable.
- **commands (Alt+S)**: the keyboard shortcut to solve the current puzzle.
- **Remote code**: none. All code ships inside the package.

## Privacy answers

- Data collected: none. No personal data, health, financial, authentication, location, web history, user activity or website content is collected, stored on a server or transmitted.
- Data sold or transferred to third parties: none.
- Data used for purposes unrelated to the single purpose: none.
- Creditworthiness or lending: no.
- The extension makes no network requests of its own.
- Apple "App Privacy": Data Not Collected.
- Firefox `data_collection_permissions`: required: none (already in the manifest).

## Notes for reviewers (Chrome, Edge, Firefox, Apple)

LarpedIn adds a small panel on https://www.linkedin.com/games/zip/, /queens/, /tango/, /patches/ and /wend/ only. Seeing a real board needs a (free) LinkedIn account: open one of those games, press Start, then press Solve on the panel or Alt+S. The extension reads the board from the page, solves it locally and plays the answer with mouse events. It makes no network requests, collects no data and has no server. The only permission is `storage` plus content scripts on https://www.linkedin.com/*. Source: https://github.com/GourdinGourdin/larpedin. Build for Firefox: `npm ci && npm run build`, output in `dist/firefox` (Node 22). The automated test (`npm run test:ext`) runs the built extension against local mock boards and never contacts linkedin.com.

## Screenshots (in dist/store-assets/)

Captions, in order (use as alt text where a store asks for it):

1. `01-queens-solved.png`: "Press Solve and Queens is done in about 30 ms."
2. `02-zip-solved.png`: "Zip: one path through every cell, drawn for you."
3. `03-tango-solved.png`: "Tango solved, with a timing breakdown for each step."
4. `04-popup.png`: "The toolbar popup: status, Solve now, auto-solve and the shortcut."
5. `05-welcome-settings.png`: "Settings: auto-solve, shortcut, Light, Dark or Match device, per-game options."
6. `06-dark-settings.png` (Firefox set): "The dark theme and the in-page settings."

Promo images (Chrome): `promo-tile-440x280.png` (small tile), `promo-marquee-1400x560.png` (marquee).

## Apple App Store

- Name: LarpedIn. Subtitle (30 characters): Solves LinkedIn's daily games
- Promotional text (170): Open a LinkedIn puzzle in Safari, press Solve, and LarpedIn reads the board, solves it and plays the answer.
- Keywords (100): puzzle,zip,queens,tango,patches,wend,solver,games,safari extension
- Description: the long description above, with "Alt+S" replaced by "Command-S or your own shortcut" if you change it.
- Age rating: 4+. Price: free.
- Review notes: the reviewer notes above, plus: enable the extension in Safari > Settings > Extensions, allow it on linkedin.com.
