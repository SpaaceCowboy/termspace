#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; OFF=$'\033[0m'

echo "${BOLD}== current resume state ==${OFF}"
sed -n '1,220p' docs/state/backend.md

echo
echo "${BOLD}== unticked phase work ==${OFF}"
awk '/^## Phase/{p=$0} /^\*\*Server|^\*\*Web|^\*\*Shared/{o=$0} /^- \[ \]/{if(p!=""){print "\n"p; p=""} if(o!=""){print "  "o; o=""} print "    "$0}' docs/PHASES.md | head -40

echo
echo "${BOLD}== gate ==${OFF}"
sed -n '/^| Phase/,/^$/p' docs/PHASES.md

echo
echo "${BOLD}== active contract design ==${OFF}"
awk '/^## Design notes/{f=1;next} /^## Settled/{f=0} f && /^### /' docs/CONTRACTS.md | sed 's/^/  /'
awk '/^## Design notes/{f=1;next} /^## Settled/{f=0} f && /^### /' docs/CONTRACTS.md | grep -q . || echo "  none"

echo
echo "${BOLD}== last 30 progress entries ==${OFF}"
grep -n '^### ' docs/PROGRESS.md | tail -30 | while IFS=: read -r n rest; do
  body=$(sed -n "$((n+1))p" docs/PROGRESS.md)
  echo "    ${rest#\#\#\# }"
  echo "${DIM}       ${body}${OFF}"
done

echo
echo "${BOLD}== recent commits ==${OFF}"
git log --oneline -15 2>/dev/null || echo "  (no git history yet)"

echo
echo "${BOLD}== working tree ==${OFF}"
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  git status --porcelain | sed 's/^/  /'
else
  echo "  clean"
fi
