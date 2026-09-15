#!/usr/bin/env bash
# Capture preflight for old-system-ui-clone.
# Prints capability level for logged-in browser capture.
# Exit 0 = claim-tab or cdp-tab ready; exit 1 = blocked.

set -euo pipefail

WEB_ACCESS="${WEB_ACCESS_SKILL_DIR:-$HOME/.claude/skills/web-access}"
CHECK_DEPS="$WEB_ACCESS/scripts/check-deps.mjs"

echo "old-system-ui-clone capture preflight"

if [[ -f "$CHECK_DEPS" ]]; then
  if node "$CHECK_DEPS"; then
  echo "capability: cdp-tab"
  echo "next: curl -s http://localhost:3456/targets"
  exit 0
  fi
  echo "capability: blocked"
  echo "user-action: Chrome 打开 chrome://inspect/#remote-debugging 并勾选 Allow remote debugging"
  exit 1
fi

echo "capability: unknown"
echo "hint: install web-access skill for CDP, or provide source/screenshots/"
echo "user-action: 将目标页面截图放到 source/screenshots/，或安装 web-access 后重试"
exit 1
