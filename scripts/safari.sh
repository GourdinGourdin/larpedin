#!/bin/sh
# Wraps the Safari build in an Xcode project with a macOS app and an iOS app
# (Safari only ships extensions inside an App Store app).
#
#   npm run build && sh scripts/safari.sh   -> dist/safari-xcode/LarpedIn/
#
# Needs the full Xcode from the App Store (Command Line Tools alone don't have
# the converter). Then in Xcode: pick your team under Signing & Capabilities
# for all four targets, Product > Archive, and upload to App Store Connect.
# To try it locally first: run the macOS scheme, then in Safari turn on
# Settings > Advanced > "Show features for web developers", Develop >
# "Allow Unsigned Extensions", and enable LarpedIn in Settings > Extensions.
set -e
cd "$(dirname "$0")/.."
BUNDLE_ID="${BUNDLE_ID:-app.larpedin.LarpedIn}"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found: install Xcode from the App Store, then run" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
[ -f dist/safari/manifest.json ] || npm run build

rm -rf dist/safari-xcode
xcrun safari-web-extension-converter dist/safari \
  --project-location dist/safari-xcode \
  --app-name "LarpedIn" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift --copy-resources --no-open --force
echo "Xcode project: dist/safari-xcode/LarpedIn/LarpedIn.xcodeproj"
