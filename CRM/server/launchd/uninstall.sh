#!/usr/bin/env bash
# Remove the CRM server launchd agent.

set -e

PLIST_DEST="$HOME/Library/LaunchAgents/com.vernontm.crm-server.plist"
LABEL="com.vernontm.crm-server"

if launchctl list | grep -q "$LABEL"; then
  echo "Unloading agent..."
  launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

if [ -f "$PLIST_DEST" ]; then
  rm "$PLIST_DEST"
  echo "✅ Removed $PLIST_DEST"
else
  echo "Not installed (nothing to remove)."
fi
