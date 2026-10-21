#!/bin/bash
# Double-click to run OAuth App Setup Guides locally. Opens http://localhost:3000.
cd "$(dirname "$0")" || exit 1

if [ -f .env.local ] && grep -q "^ANTHROPIC_API_KEY=sk" .env.local; then
  echo "ANTHROPIC_API_KEY found in .env.local: live generation is on."
else
  echo "No ANTHROPIC_API_KEY in .env.local: running the generation pipeline in mock mode."
  echo "Add ANTHROPIC_API_KEY=sk-... to .env.local and run this again for live generation."
  export GUIDES_MOCK=1
fi

# npm install is quick when nothing changed and adds the native packages for this machine
# (for example when node_modules was installed from another OS).
echo "Checking dependencies..."
npm install --no-audit --no-fund --loglevel=error

existing=$(lsof -ti tcp:3000)
if [ -n "$existing" ]; then
  echo "Stopping the previous server on port 3000..."
  kill $existing 2>/dev/null
  sleep 1
fi

(sleep 6; open "http://localhost:3000") &
npm run dev
