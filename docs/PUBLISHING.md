# Publishing LarpedIn

Everything you upload is produced by two commands:

```bash
git add -A && git commit -m "Release 1.1.0"   # the Firefox source zip is made from HEAD, so commit first
npm run build && npm run assets:store
```

| You upload | File |
|---|---|
| Chrome Web Store and Edge Add-ons | `dist/store/larpedin-chrome-<version>.zip` |
| Firefox AMO (listed) | `dist/store/larpedin-firefox-<version>.zip` and `dist/store/larpedin-source-<version>.zip` |
| Firefox unlisted (self-hosted XPI) | signed by `npm run sign:firefox`, no upload |
| Apple | the Xcode project from `sh scripts/safari.sh` |
| Screenshots and promo images | `dist/store-assets/chrome/` and `dist/store-assets/firefox/` |
| All listing text and answers | [store-listing.md](store-listing.md) |

Run `npm run test:ext` first. It loads the built extension in Chromium, solves all five games on mock
boards, checks the popup, the welcome page, settings and the userscript, and lints the Firefox build.

A real one-click install, where the extension adds itself to the browser, only comes from a store (or, on
Firefox, from a signed XPI). Chrome, Edge and Brave block extensions installed from a website, and Safari only
runs extensions that ship inside an App Store app. Only you can create the accounts below.

Phones: Chrome for Android and every iPhone browser except Safari cannot run extensions. Android users install
through Firefox for Android; iPhone and iPad users through the App Store app and Safari.

## Before the first submission

- [ ] Privacy policy URL, wherever a store asks: `https://github.com/GourdinGourdin/larpedin#privacy`
      (the README has a Privacy section).
- [ ] Support URL: `https://github.com/GourdinGourdin/larpedin/issues`. Homepage: `https://gourdingourdin.github.io/larpedin/`.
- [ ] Decide on a license. `package.json` says ISC but there is no `LICENSE` file. AMO asks you to pick one.

## Chrome Web Store (Chrome, Brave, Opera, Arc, Vivaldi)

Account: <https://chrome.google.com/webstore/devconsole>, one-time 5 USD fee, two-step verification on.

- [ ] Dashboard > **Add new item** > upload `larpedin-chrome-<version>.zip`.
- [ ] **Store listing** tab: paste name, summary and description from `store-listing.md`. Category: Fun. Language: English.
- [ ] Graphics: icon 128 is in the zip. Upload `dist/store-assets/chrome/01` to `05` (1280x800), the small promo tile
      `promo-tile-440x280.png`, and the marquee `promo-marquee-1400x560.png`.
- [ ] **Privacy** tab: single purpose, permission justifications and data answers from `store-listing.md`.
      Tick all three certifications. Remote code: No.
- [ ] **Distribution**: Public, all regions, free.
- [ ] **Test instructions** (Privacy tab or Submit dialog): paste the reviewer notes from `store-listing.md`.
- [ ] **Submit for review**. Review takes from a day to about three weeks.
- [ ] Copy the listing URL into `STORES` at the top of `site/assets/main.js`.

Updates: bump `version` in `package.json`, build, upload the new zip as a new package.

## Microsoft Edge Add-ons

Account: <https://partner.microsoft.com/dashboard/microsoftedge>, free.

- [ ] **Create new extension** > upload the same `larpedin-chrome-<version>.zip`.
- [ ] Availability: public, all markets. Category: Entertainment.
- [ ] Listing: same text as Chrome. Logo: `dist/store-assets/icon-300.png`. Screenshots: `dist/store-assets/chrome/01` to `05`.
      Small promo tile: `promo-tile-440x280.png`.
- [ ] Privacy policy URL, and the **Notes for certification** from `store-listing.md`.
- [ ] **Publish**. Review takes up to about a week. Edge also installs from the Chrome Web Store, so this is optional.

## Firefox Add-ons (AMO), listed

Account: <https://addons.mozilla.org/developers/>, free.

- [ ] **Submit a New Add-on** > **On this site** > Firefox desktop and **Firefox for Android** both ticked.
- [ ] Upload `larpedin-firefox-<version>.zip`. The linter should report no errors (`npm run lint:firefox`;
      the data-collection warnings about Firefox 140 are expected, older Firefox ignores that key).
- [ ] "Do you need to submit source code?" Yes: upload `larpedin-source-<version>.zip`. Build steps for the reviewer:
      `npm ci` then `npm run build`, output in `dist/firefox`. Node 22.
- [ ] Listing: name, summary, description, categories (Games, Other), support URL, privacy policy, license from
      `store-listing.md`. Screenshots: `dist/store-assets/firefox/` (any 1280x800 set; `06-dark-settings.png` shows the dark theme).
- [ ] Reviewer notes from `store-listing.md`.
- [ ] Submit. Review is usually a few days.
- The add-on id `larpedin@larpedin.app` (in `scripts/build.mjs`) is permanent once submitted. Change it first if you
  want your own domain in it.

## Firefox unlisted: one-click install from the website, no store listing

Firefox installs any Mozilla-signed XPI from a link, with a normal "Add LarpedIn?" prompt, and updates it itself.
The website's Firefox button points at `site/downloads/larpedin.xpi` once it exists.

- [ ] On <https://addons.mozilla.org/developers/addon/api/key/> create API credentials (JWT issuer and secret).
- [ ] GitHub repo > Settings > Secrets and variables > Actions > add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.
      With both set, every push that deploys the site signs the current `package.json` version once
      (kept as the release asset `xpi-v<version>`, reused afterwards), and the site gets `larpedin.xpi`,
      `firefox-updates.json` and an `xpi` entry in `latest.json`. With either missing, the step is skipped.
- [ ] Or by hand: `AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run sign:firefox && npm run site:build`.
      The keys are read from the environment only and never written to a file.
- Signing takes a few minutes. Mozilla refuses to sign the same version twice, so bump `version` for each new XPI.
- The signed build is `dist/firefox-selfhosted`: the same code plus `gecko.update_url`
  (`https://gourdingourdin.github.io/larpedin/downloads/firefox-updates.json`), which AMO would reject on a listed add-on.
- If you also publish the listed add-on, a version number can only be used once per add-on across both channels.
  Give the listed and unlisted releases different versions (for example listed 1.1.0, then unlisted 1.1.1).

## Apple (Safari on Mac, iPhone, iPad)

Account: Apple Developer Program, 99 USD per year, <https://developer.apple.com/programs/>. Needs a Mac with full
Xcode from the App Store.

- [ ] `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
- [ ] `npm run build && sh scripts/safari.sh` (bundle id `app.larpedin.LarpedIn`, set `BUNDLE_ID=...` to change it).
- [ ] Open `dist/safari-xcode/LarpedIn/LarpedIn.xcodeproj`. Under Signing & Capabilities pick your team for all four targets.
- [ ] Product > Archive for the macOS scheme and again for the iOS scheme > Distribute App > App Store Connect.
- [ ] <https://appstoreconnect.apple.com>: create the app record, paste name, subtitle, description, keywords and the
      privacy answers (Data Not Collected) from `store-listing.md`, and add the review notes.
- [ ] Screenshots: Apple needs its own sizes. Mac accepts 1280x800 (`dist/store-assets/chrome/`). iPhone and iPad sizes
      must be taken in the Simulator (not generated here).
- [ ] Submit for review. Safari users then enable the extension in Safari > Settings > Extensions.
- To try it unsigned first: run the macOS scheme, Safari > Settings > Advanced > Show features for web developers,
  Develop > Allow Unsigned Extensions, then enable LarpedIn in Settings > Extensions.

## Userscript (Tampermonkey, Violentmonkey, Safari "Userscripts" app)

Nothing to publish. `https://gourdingourdin.github.io/larpedin/downloads/larpedin.user.js` opens the manager's install
page. The header has `@downloadURL` and `@updateURL` so managers update it, `@grant none` and `@inject-into page`
so it runs in the page itself where React's props are readable.

## Review risks

- **The name.** "LarpedIn" no longer contains the word LinkedIn, which helps a lot, but it still plays on it. Keep the
  "not affiliated with LinkedIn" line in every listing and do not use LinkedIn's logo or blue in screenshots or icons.
  The generated screenshots use a generic mock page for that reason.
- **Automation.** The extension plays another site's games for the user. Stores allow that in principle, but LinkedIn's
  User Agreement restricts automation, so a complaint could lead to removal.
- **Reviewers need a LinkedIn account** to see a real board. The reviewer notes explain this and that the extension
  does nothing outside `https://www.linkedin.com/games/*`.
- **Not verified on the live site:** every play step. `npm run test:ext` proves reading, solving and playing against
  mock boards that judge the moves, not against LinkedIn itself. Try each game once on the real site before submitting.
