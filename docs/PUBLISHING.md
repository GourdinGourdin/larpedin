# Publishing Linkedin Larp to the browser stores

A one-click install, where the extension sets itself up and appears in the browser's
extension list, only comes from a browser's own store. A zip from a website can't do it:
Chrome, Edge and Brave block extensions installed from outside their store, and Safari
only runs extensions that ship inside an App Store app. So each store needs an account,
an upload and a review. Only you can create the accounts.

`npm run build` makes everything you upload:

| Store | Covers | Upload | Account |
|---|---|---|---|
| Chrome Web Store | Chrome, Brave, Opera, Arc, Vivaldi (Windows, Mac, Linux, ChromeOS) | `dist/store/linkedin-larp-chrome-<v>.zip` | One-time $5 developer fee, chrome.google.com/webstore/devconsole |
| Microsoft Edge Add-ons | Edge (Windows, Mac) | the same Chrome zip | Free, partner.microsoft.com (Edge can also install from the Chrome Web Store) |
| Firefox Add-ons (AMO) | Firefox desktop **and Firefox for Android** | `dist/store/linkedin-larp-firefox-<v>.zip`, plus `linkedin-larp-source-<v>.zip` when asked for source | Free, addons.mozilla.org/developers |
| Apple App Store | Safari on **Mac, iPhone, iPad** | Xcode project from `sh scripts/safari.sh` | Apple Developer Program, $99/year, plus full Xcode |

Phones: Chrome for Android and every iPhone browser other than Safari can't run
extensions at all. Android users install through Firefox for Android; iPhone and iPad
users through the App Store app and Safari.

## Steps

1. **Chrome Web Store.** Create the developer account, click *New item*, upload the
   Chrome zip. Fill in the listing (screenshots are in `docs/screenshots/`, the 128 px icon
   in `src/extension/icons/`), the privacy form (no data collected, only `storage`) and a
   single-purpose description. Review takes from a day to a few weeks.
2. **Edge Add-ons.** Same zip, same listing text.
3. **Firefox.** Submit the Firefox zip "On this site". The add-on id
   (`linkedin-larp@linkedin-larp.app`, in `scripts/build.mjs`) is permanent once
   published: change it first if you want your own domain in it. Tick Android
   compatibility so it shows up in Firefox for Android.
4. **Safari.** Install Xcode from the Mac App Store, run
   `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then
   `sh scripts/safari.sh`. Open the project, set your team on all targets, archive the
   macOS and iOS apps and submit them in App Store Connect.
5. **Website.** Paste each listing URL into `STORES` at the top of
   `site/assets/main.js`. The buttons then go straight to the store for the visitor's
   browser; until then they show "Coming soon" and link to the hand-install steps.

## Review risks

- **The name.** "Linkedin Larp" contains LinkedIn's trademark. Store reviewers
  often reject that, or LinkedIn can file a takedown. A name without "LinkedIn" in it
  (describing it as "for LinkedIn games" in the text) has a much better chance.
- **Automation.** The extension plays another site's games for the user. Stores allow
  that in principle, but LinkedIn's User Agreement restricts automation, so a complaint
  could lead to removal.
- **Not tested yet:** the Firefox build, the Safari fallback that re-injects the page
  script when a browser ignores `world: "MAIN"`, and any play step on the live site.
  Load each build by hand once before you submit it.
