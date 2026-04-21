#!/usr/bin/env bash
# Install the CRM server (including the avatar render worker) as a launchd
# user-agent so it starts on login, runs in the background, and restarts on crash.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.vernontm.crm-server.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.vernontm.crm-server.plist"
LABEL="com.vernontm.crm-server"

if [ ! -f "$PLIST_SRC" ]; then
  echo "❌ Can't find $PLIST_SRC"
  exit 1
fi

echo "Copying plist to ~/Library/LaunchAgents/..."
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SRC" "$PLIST_DEST"

# If it's already loaded, unload first so changes take effect
if launchctl list | grep -q "$LABEL"; then
  echo "Unloading existing agent..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

echo "Loading agent..."
launchctl load "$PLIST_DEST"

echo ""
echo "✅ CRM server installed as launchd agent."
echo ""
echo "Status:"
launchctl list | grep "$LABEL" || echo "  (not yet listed — check logs)"
echo ""
echo "Logs:"
echo "  stdout  →  ~/Library/Logs/vtm-crm-server.out.log"
echo "  stderr  →  ~/Library/Logs/vtm-crm-server.err.log"
echo ""
echo "Tail the output:"
echo "  tail -f ~/Library/Logs/vtm-crm-server.out.log"
echo ""
echo "Uninstall anytime with:"
echo "  bash \"$SCRIPT_DIR/uninstall.sh\""
