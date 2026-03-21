#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_NAME="SovereignMenubar"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
BIN_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"
TMP_SWIFT="/tmp/sovereign-menubar-main-$$.swift"
APP_VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"
MACOS_DIR="$REPO_ROOT/tools/macos/SovereignMenubar"

mkdir -p "$BIN_DIR" "$RES_DIR"

sed -e "s#__REPO_ROOT__#${REPO_ROOT}#g" -e "s#__APP_VERSION__#${APP_VERSION}#g" \
  "$MACOS_DIR/main.swift.template" >"$TMP_SWIFT"

swiftc \
  "$MACOS_DIR/MenubarCore.swift" \
  "$TMP_SWIFT" \
  -o "$BIN_DIR/${APP_NAME}" \
  -framework AppKit

rm -f "$TMP_SWIFT"

cat >"$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.sovereign.menubar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

chmod +x "$BIN_DIR/${APP_NAME}"

echo "Installed: $APP_DIR (version ${APP_VERSION})"
echo "Run: open \"$APP_DIR\""
