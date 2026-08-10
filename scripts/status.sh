#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; DIM=$'\033[2m'; OFF=$'\033[0m'
ROLE="${1:-}"

if [ -z "$ROLE" ]; then
  echo "usage: ./scripts/status.sh <backend|frontend>"; exit 1
fi

echo "${BOLD}== your current state (read this first) ==${OFF}"
sed -n '/^---$/,$p' "docs/state/${ROLE}.md" | tail -n +2

echo
echo "${BOLD}== other agent's current state ==${OFF}"
OTHER=$([ "$ROLE" = backend ] && echo frontend || echo backend)
sed -n '/^---$/,$p' "docs/state/${OTHER}.md" | tail -n +2

echo
echo "${BOLD}== unticked boxes, current phase ==${OFF}"
awk '/^## Phase/{p=$0} /^\*\*Backend|^\*\*Frontend|^\*\*Shared/{o=$0} /^- \[ \]/{if(p!=""){print "\n"p; p=""} if(o!=""){print "  "o; o=""} print "    "$0}' docs/PHASES.md | head -40

echo
echo "${BOLD}== gate ==${OFF}"
sed -n '/^| Phase/,/^$/p' docs/PHASES.md

echo
echo "${BOLD}== open contract proposals ==${OFF}"
awk '/^## Proposals/{f=1;next} /^## Settled/{f=0} f && /^### /' docs/CONTRACTS.md | sed 's/^/  /'
awk '/^## Proposals/{f=1;next} /^## Settled/{f=0} f && /^### /' docs/CONTRACTS.md | grep -q . || echo "  none"

echo
echo "${BOLD}== last 30 progress entries ==${OFF}"
grep -n '^### ' docs/PROGRESS.md | tail -30 | while IFS=: read -r n rest; do
  body=$(sed -n "$((n+1))p" docs/PROGRESS.md)
  case "$rest" in
    *BROKE*)   mark="  !!" ;;
    *BLOCKED*) mark="  ??" ;;
    *)         mark="   " ;;
  esac
  echo "${mark} ${rest#\#\#\# }"
  echo "${DIM}       ${body}${OFF}"
done

echo
echo "${BOLD}== recent commits ==${OFF}"
git log --oneline -15 2>/dev/null || echo "  (no git history yet)"

echo
echo "${BOLD}== drift check ==${OFF}"
ticked=$(grep -c '^- \[x\]' docs/PHASES.md 2>/dev/null || echo 0)
done_entries=$(grep -c 'DONE$' docs/PROGRESS.md 2>/dev/null || echo 0)
echo "  ticked boxes: $ticked   DONE entries: $done_entries"
if [ "$ticked" -gt "$done_entries" ]; then
  echo "  !! boxes ticked without a matching DONE entry — verify before trusting the gate"
fi
dupes=$(grep -rn 'interface \(Session\|Project\|ServerFrame\|ClientFrame\|ApiError\)' server/src web/src 2>/dev/null)
if [ -n "$dupes" ]; then
  echo "  !! shared type redeclared outside packages/contracts:"
  echo "$dupes" | sed 's/^/     /'
fi
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "  ~~ uncommitted changes present:"
  git status --porcelain | sed 's/^/     /'
fi
