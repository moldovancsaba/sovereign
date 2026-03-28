#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MACOS_DIR="$REPO_ROOT/tools/macos/SovereignDesktop"
APP_NAME="Sovereign"
APP_VERSION="$(tr -d '[:space:]' <"$REPO_ROOT/VERSION")"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"
TMP_SWIFT="/tmp/sovereign-desktop-main-$$.swift"

# Optional: build Theia Electron shell (slow; not required for WKWebView launcher).
DESKTOP_BUILD_THEIA_ELECTRON="${DESKTOP_BUILD_THEIA_ELECTRON:-0}"

# Where to install the .app bundle:
# - SOVEREIGN_INSTALL_PARENT=/Applications  → system Applications (use sudo if needed)
# - default: /Applications when writable, else ~/Applications
resolve_install_parent() {
  if [[ -n "${SOVEREIGN_INSTALL_PARENT:-}" ]]; then
    printf '%s' "$SOVEREIGN_INSTALL_PARENT"
    return
  fi
  if [[ -d "/Applications" && -w "/Applications" ]]; then
    printf '/Applications'
    return
  fi
  printf '%s' "$HOME/Applications"
}

APP_PARENT="$(resolve_install_parent)"
APP_DIR="$APP_PARENT/${APP_NAME}.app"
BIN_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"

if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "npm binary not found. Install Node.js 20+."
  exit 1
fi

if ! command -v swiftc >/dev/null 2>&1; then
  echo "swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
  exit 1
fi

if [[ "$DESKTOP_BUILD_THEIA_ELECTRON" == "1" ]]; then
  echo "Bootstrapping Theia Electron (optional)..."
  "$NPM_BIN" --prefix "$REPO_ROOT/tools/theia-desktop/electron-app" install
  "$NPM_BIN" --prefix "$REPO_ROOT/tools/theia-desktop/electron-app" run build
else
  echo "Skipping Theia Electron build (set DESKTOP_BUILD_THEIA_ELECTRON=1 to enable)."
fi

mkdir -p "$BIN_DIR" "$RES_DIR"

sed \
  -e "s#__REPO_ROOT__#${REPO_ROOT}#g" \
  -e "s#__APP_VERSION__#${APP_VERSION}#g" \
  "$MACOS_DIR/main.swift.template" >"$TMP_SWIFT"

swiftc \
  "$MACOS_DIR/DesktopCore.swift" \
  "$TMP_SWIFT" \
  -o "$BIN_DIR/${APP_NAME}" \
  -framework AppKit \
  -framework WebKit

rm -f "$TMP_SWIFT"
chmod +x "$BIN_DIR/${APP_NAME}"

cat >"$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.sovereign.desktop</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${APP_VERSION}</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
  </dict>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

echo ""
echo "Installed: $APP_DIR (version ${APP_VERSION})"
if [[ "$APP_PARENT" == "$HOME/Applications" ]]; then
  echo ""
  echo "Note: Installed to your user Applications folder (Finder → Go → Home → Applications)."
  echo "To copy to system Applications for all users, run:"
  echo "  sudo ditto \"$APP_DIR\" \"/Applications/${APP_NAME}.app\""
fi
echo ""
echo "Launch now: open \"$APP_DIR\""
echo ""
echo "Native shell is compiled from tools/macos/SovereignDesktop/main.swift.template on each install."
echo "If the loader still shows literal \"{sovereign}\" or an old version in the title bar, quit Sovereign (⌘Q),"
echo "run this script again from an updated clone, then open the .app path printed above."
open "$APP_DIR" || true
