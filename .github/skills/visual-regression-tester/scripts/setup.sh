#!/usr/bin/env bash
# VRT Setup Script — installs all dependencies
set -e

echo "📦 Installing VRT dependencies..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 18+ is required. Found: $(node -v)"
  exit 1
fi

# Initialize package.json if not present
if [ ! -f package.json ]; then
  npm init -y --quiet
fi

# Install npm packages
npm install --save-dev \
  playwright \
  pixelmatch \
  pngjs \
  sharp \
  cli-progress \
  chalk \
  commander \
  p-limit \
  2>/dev/null

# Install Chromium browser for Playwright
echo "🌐 Installing Chromium for Playwright..."
npx playwright install chromium --with-deps 2>/dev/null || \
  npx playwright install chromium

echo "✅ Setup complete!"
echo ""
echo "Next: create vrt.config.json and run:"
echo "  node scripts/run-all.js --input test-links.md --config vrt.config.json"