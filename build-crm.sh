#!/bin/bash
# Build the CRM React app and copy to New/admin/ for Vercel deployment

set -e

echo "Building CRM client..."
cd "$(dirname "$0")/CRM/client"
npm install
npm run build

echo "Copying build to New/admin/..."
rm -rf "$(dirname "$0")/New/admin"
cp -r dist "$(dirname "$0")/New/admin"

echo "Done! CRM built and copied to New/admin/"
echo "Files:"
ls -la "$(dirname "$0")/New/admin/"
