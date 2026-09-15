#!/usr/bin/env python3
"""List Google Chrome tab titles and URLs on macOS via AppleScript.

This is a metadata fallback only. It can help discover whether a target page is
already open, but it cannot inspect DOM, computed styles, screenshots, cookies,
cache, or in-progress UI state. Use the Chrome plugin to claim a tab for real
page extraction.
"""

from __future__ import annotations

import json
import platform
import subprocess
import sys


SCRIPT = r'''
tell application "Google Chrome"
  set out to ""
  repeat with w from 1 to count of windows
    set tabCount to count of tabs of window w
    repeat with t from 1 to tabCount
      set tabTitle to title of tab t of window w
      set tabUrl to URL of tab t of window w
      set out to out & w & tab & t & tab & tabTitle & tab & tabUrl & linefeed
    end repeat
  end repeat
  return out
end tell
'''


def main() -> int:
    if platform.system() != "Darwin":
        print("This helper only supports macOS.", file=sys.stderr)
        return 2

    result = subprocess.run(
        ["osascript", "-e", SCRIPT],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(result.stderr.strip() or result.stdout.strip(), file=sys.stderr)
        return result.returncode

    tabs = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("\t", 3)
        if len(parts) != 4:
            continue
        window, index, title, url = parts
        tabs.append({
            "window": int(window),
            "tab": int(index),
            "title": title,
            "url": url,
        })

    print(json.dumps(tabs, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
