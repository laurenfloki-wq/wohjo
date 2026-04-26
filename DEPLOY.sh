#!/bin/bash
# FLOSMOSIS Sprint 1 — One-command Vercel deploy
# Run this from the wohjo/ folder on your local machine
# Requires: Node.js installed

set -e

echo "FLOSMOSIS Deploy — Sprint 1"
echo "========================"

VERCEL_TOKEN="***REMOVED-VERCEL-TOKEN***"
TEAM_SCOPE="wohjos-projects"
PROJECT_NAME="wohjo"

# Install vercel CLI if not present
if ! command -v vercel &> /dev/null; then
  echo "Installing Vercel CLI..."
  npm install -g vercel
fi

# Deploy to production
echo "Deploying to production..."
vercel --prod \
  --token="$VERCEL_TOKEN" \
  --scope="$TEAM_SCOPE" \
  --yes \
  --name="$PROJECT_NAME"

echo ""
echo "Done! Update NEXT_PUBLIC_APP_URL in Vercel dashboard if the URL differs from https://flosmosis.com"
