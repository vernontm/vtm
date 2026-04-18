#!/bin/bash
# Build the CRM React app and copy to New/admin/ for Vercel deployment

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Building CRM client..."
cd "$ROOT_DIR/CRM/client"
npm install
npm run build

echo "Copying build to New/admin/..."
rm -rf "$ROOT_DIR/New/admin"
cp -r "$ROOT_DIR/CRM/client/dist" "$ROOT_DIR/New/admin"

echo "Done! CRM built and copied to New/admin/"
echo "Files:"
ls -la "$ROOT_DIR/New/admin/"
