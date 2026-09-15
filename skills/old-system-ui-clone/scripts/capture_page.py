#!/usr/bin/env python3
"""Capture a browser screenshot for legacy UI clone QA.

Requires Python Playwright to already be installed.
This opens a separate browser context. It does not reuse already-open Chrome
tabs, cookies, cache, or in-progress page state. For those, use the Chrome
plugin and claim the existing tab.
"""

from __future__ import annotations

import argparse
import platform
import sys
from pathlib import Path


def to_target(value: str) -> str:
    if value.startswith(("http://", "https://", "file://")):
        return value
    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Target does not exist: {path}")
    return path.as_uri()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture a screenshot for visual QA.")
    parser.add_argument("target", help="Local HTML file, file:// URL, or http(s) URL")
    parser.add_argument("output", help="Output PNG path")
    parser.add_argument("--width", type=int, default=1920, help="Viewport width")
    parser.add_argument("--height", type=int, default=1080, help="Viewport height")
    parser.add_argument("--full-page", action="store_true", help="Capture full scrollable page")
    parser.add_argument(
        "--browser-executable",
        help="Optional local Chrome/Edge/Chromium executable path. Defaults to auto-detecting a system browser.",
    )
    return parser.parse_args()


def candidate_browsers() -> list[Path]:
    system = platform.system()
    if system == "Darwin":
        return [
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
            Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
        ]
    if system == "Windows":
        roots = [
            Path.home() / "AppData/Local",
            Path("C:/Program Files"),
            Path("C:/Program Files (x86)"),
        ]
        return [
            roots[0] / "Google/Chrome/Application/chrome.exe",
            roots[1] / "Google/Chrome/Application/chrome.exe",
            roots[2] / "Google/Chrome/Application/chrome.exe",
            roots[1] / "Microsoft/Edge/Application/msedge.exe",
            roots[2] / "Microsoft/Edge/Application/msedge.exe",
        ]
    return [
        Path("/usr/bin/google-chrome"),
        Path("/usr/bin/google-chrome-stable"),
        Path("/usr/bin/microsoft-edge"),
        Path("/usr/bin/chromium"),
        Path("/usr/bin/chromium-browser"),
    ]


def resolve_browser_executable(value: str | None) -> str | None:
    if value:
        path = Path(value).expanduser().resolve()
        if not path.exists():
            raise SystemExit(f"Browser executable does not exist: {path}")
        return str(path)
    for path in candidate_browsers():
        if path.exists():
            return str(path)
    return None


def main() -> int:
    args = parse_args()
    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    browser_executable = resolve_browser_executable(args.browser_executable)

    try:
      from playwright.sync_api import sync_playwright
    except ImportError:
      print(
          "Python Playwright is not installed. Use an available browser tool, "
          "or ask the user before installing Playwright.",
          file=sys.stderr,
      )
      return 2

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(executable_path=browser_executable) if browser_executable else p.chromium.launch()
        except Exception as exc:
            if browser_executable:
                print(f"Failed to launch system browser: {browser_executable}", file=sys.stderr)
            else:
                print("No system Chrome/Edge/Chromium was found; Playwright tried its bundled browser.", file=sys.stderr)
            print(str(exc), file=sys.stderr)
            print(
                "Install a system Chrome/Edge browser, pass --browser-executable, "
                "or install Playwright browsers only if you explicitly want the bundled runtime.",
                file=sys.stderr,
            )
            return 3
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        page.goto(to_target(args.target), wait_until="networkidle")
        page.screenshot(path=str(output), full_page=args.full_page)
        browser.close()

    print(f"Screenshot saved: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
