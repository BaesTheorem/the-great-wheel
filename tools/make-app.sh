#!/bin/bash
# Builds /Applications/Wildspace Orrery Editor.app: a double-click launcher that starts the local
# editor server (bin/orrery serve) and opens the map in edit mode. Run it again after a move.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP="/Applications/Wildspace Orrery Editor.app"
mkdir -p "$APP/Contents/MacOS"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Wildspace Orrery Editor</string>
<key>CFBundleExecutable</key><string>launcher</string>
<key>CFBundleIdentifier</key><string>com.alexhedtke.wildspace-orrery-editor</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
cat > "$APP/Contents/MacOS/launcher" <<LAUNCH
#!/bin/bash
# If the editor already runs, open it again; else start it.
if /usr/bin/curl -s -o /dev/null --max-time 1 http://127.0.0.1:5027/api/status; then
  /usr/bin/open "http://127.0.0.1:5027/?edit#/"
  exit 0
fi
cd "$REPO"
exec /usr/bin/python3 bin/orrery serve --open
LAUNCH
chmod +x "$APP/Contents/MacOS/launcher"
echo "built $APP"
