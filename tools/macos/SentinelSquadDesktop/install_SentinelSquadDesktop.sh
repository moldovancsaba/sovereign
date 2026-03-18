#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_NAME="SentinelSquad"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
BIN_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"
TMP_SWIFT="/tmp/sentinelsquad-desktop-main.swift"
APP_VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"
NPM_BIN="${NPM_BIN:-$(command -v npm || true)}"

if [[ -z "$NPM_BIN" || ! -x "$NPM_BIN" ]]; then
  echo "npm binary not found."
  exit 1
fi

echo "Bootstrapping desktop dependencies..."
"$NPM_BIN" --prefix "$REPO_ROOT/tools/theia-desktop/electron-app" install
echo "Building desktop shell..."
"$NPM_BIN" --prefix "$REPO_ROOT/tools/theia-desktop/electron-app" run build

mkdir -p "$BIN_DIR" "$RES_DIR"

sed \
  -e "s#__REPO_ROOT__#${REPO_ROOT}#g" \
  -e "s#__APP_VERSION__#${APP_VERSION}#g" \
  "$REPO_ROOT/tools/macos/SentinelSquadDesktop/main.swift.template" > "$TMP_SWIFT"

swiftc \
  "$REPO_ROOT/tools/macos/SentinelSquadDesktop/DesktopCore.swift" \
  "$TMP_SWIFT" \
  -o "$BIN_DIR/${APP_NAME}" \
  -framework AppKit \
  -framework WebKit

chmod +x "$BIN_DIR/${APP_NAME}"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
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
  <string>com.sentinelsquad.desktop</string>
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

echo "Installed: $APP_DIR (version ${APP_VERSION})"
echo "Run: open \"$APP_DIR\""
