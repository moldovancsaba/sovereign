#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_NAME="SentinelSquadMenubar"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
BIN_DIR="$APP_DIR/Contents/MacOS"
RES_DIR="$APP_DIR/Contents/Resources"
TMP_SWIFT="/tmp/main.swift"
APP_VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"

mkdir -p "$BIN_DIR" "$RES_DIR"

sed -e "s#__REPO_ROOT__#${REPO_ROOT}#g" -e "s#__APP_VERSION__#${APP_VERSION}#g" \
  "$REPO_ROOT/tools/macos/SentinelSquadMenubar/main.swift.template" > "$TMP_SWIFT"

swiftc \
  "$REPO_ROOT/tools/macos/SentinelSquadMenubar/MenubarCore.swift" \
  "$TMP_SWIFT" \
  -o "$BIN_DIR/${APP_NAME}" \
  -framework AppKit

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.sentinelsquad.menubar</string>
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

osascript -e "tell application \"System Events\"
  if not (exists login item \"${APP_NAME}\") then
    make login item at end with properties {path:\"${APP_DIR}\", hidden:false}
  end if
end tell" >/dev/null 2>&1 || true

echo "Installed: $APP_DIR (version ${APP_VERSION})"
echo "Run: open \"$APP_DIR\""
