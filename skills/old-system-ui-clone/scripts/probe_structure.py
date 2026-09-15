#!/usr/bin/env python3
"""Probe DOM structure, layout, and styles for legacy UI cloning.

Writes two files:
  *.structure.json — full archive (do not load into agent context)
  *.summary.json   — compact summary for Page Map derivation

Requires Python Playwright for live probing. Use --summarize-only to rebuild
summary from an existing structure file without a browser.
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any


DEFAULT_SELECTORS = [
    "body",
    "header",
    "nav",
    "aside",
    "main",
    "[role='tablist']",
    "form",
    "table",
    ".ant-table",
    ".el-table",
    "[class*='table']",
    "[class*='toolbar']",
    "[class*='filter']",
    "[class*='search']",
    "[class*='popover']",
    "[class*='dropdown']",
    "[class*='modal']",
    "[class*='drawer']",
    "input",
    "select",
    "textarea",
    "button",
    "[role='combobox']",
]

CONTROL_SAMPLE_SELECTORS = [
    ("input", "input"),
    ("textarea", "textarea"),
    ("select", "select"),
    ("combobox", "[role='combobox']"),
    ("button", "button"),
]

KEY_REGION_SELECTORS = [
    "body",
    "header",
    "nav",
    "aside",
    "main",
    "form",
    "table",
    "[class*='toolbar']",
    "[class*='filter']",
]

STYLE_SAMPLE_SELECTORS = [
    ("body", "body"),
    ("table", "table"),
    ("ant-table", ".ant-table"),
    ("form", "form"),
    ("toolbar", "[class*='toolbar']"),
]


def to_target(value: str) -> str:
    if value.startswith(("http://", "https://", "file://")):
        return value
    path = Path(value).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Target does not exist: {path}")
    return path.as_uri()


def summary_path_for(structure_path: Path) -> Path:
    if structure_path.name.endswith(".structure.json"):
        return structure_path.with_name(structure_path.name.replace(".structure.json", ".summary.json"))
    return structure_path.with_suffix(".summary.json")


def slim_layout(layout: dict[str, Any] | None) -> dict[str, Any]:
    layout = layout or {}
    return {
        "display": layout.get("display"),
        "position": layout.get("position"),
        "flexDirection": layout.get("flexDirection"),
        "fontSize": layout.get("fontSize"),
        "fontFamily": layout.get("fontFamily"),
        "color": layout.get("color"),
        "backgroundColor": layout.get("backgroundColor"),
        "border": layout.get("border"),
        "padding": layout.get("padding"),
    }


def build_summary(data: dict[str, Any], structure_path: Path | None = None) -> dict[str, Any]:
    by_selector = data.get("bySelector") or {}
    key_regions: list[dict[str, Any]] = []

    for selector in KEY_REGION_SELECTORS:
        items = by_selector.get(selector) or []
        if not items:
            continue
        el = items[0]
        relationships = el.get("relationships") or {}
        key_regions.append(
            {
                "selector": selector,
                "tag": el.get("tag"),
                "className": el.get("className", "")[:80],
                "box": el.get("box"),
                "labelMode": relationships.get("labelMode"),
                "controlCount": relationships.get("controlCount"),
                "layout": slim_layout(el.get("layout")),
            }
        )

    style_samples: list[dict[str, Any]] = []
    for name, selector in STYLE_SAMPLE_SELECTORS:
        items = by_selector.get(selector) or []
        if not items:
            continue
        el = items[0]
        style_samples.append(
            {
                "name": name,
                "selector": selector,
                "tag": el.get("tag"),
                "box": el.get("box"),
                "layout": slim_layout(el.get("layout")),
            }
        )

    def control_entry(kind: str, selector: str, el: dict[str, Any]) -> dict[str, Any]:
        return {
            "kind": kind,
            "selector": selector,
            "tag": el.get("tag"),
            "inputType": el.get("inputType") or el.get("type"),
            "role": el.get("role"),
            "placeholder": el.get("placeholder"),
            "text": (el.get("text") or "")[:60],
            "box": el.get("box"),
            "layout": slim_layout(el.get("layout")),
        }

    control_samples: list[dict[str, Any]] = []
    for name, selector in CONTROL_SAMPLE_SELECTORS:
        for el in (by_selector.get(selector) or [])[:3]:
            control_samples.append(control_entry(name, selector, el))

    for region_sel in ("[class*='toolbar']", "[class*='filter']", "[class*='search']", "form"):
        for container in (by_selector.get(region_sel) or [])[:2]:
            for ctrl in (container.get("relationships") or {}).get("controls", [])[:4]:
                control_samples.append(control_entry(region_sel, region_sel, ctrl))

    seen: set[str] = set()
    deduped_controls: list[dict[str, Any]] = []
    for item in control_samples:
        box = item.get("box") or {}
        key = f"{item.get('kind')}:{item.get('tag')}:{box.get('x')}:{box.get('y')}"
        if key in seen:
            continue
        seen.add(key)
        deduped_controls.append(item)
        if len(deduped_controls) >= 12:
            break

    landmarks = (data.get("landmarks") or [])[:20]

    summary: dict[str, Any] = {
        "url": data.get("url"),
        "title": data.get("title"),
        "viewport": data.get("viewport"),
        "document": {
            "scrollWidth": (data.get("document") or {}).get("scrollWidth"),
            "scrollHeight": (data.get("document") or {}).get("scrollHeight"),
        },
        "landmarks": landmarks,
        "keyRegions": key_regions,
        "styleSamples": style_samples,
        "controlSamples": deduped_controls,
        "selectorCoverage": sorted(by_selector.keys()),
        "usage": "Read this file for Page Map derivation. Do not load the matching *.structure.json into agent context.",
    }
    if structure_path is not None:
        summary["structureArchive"] = structure_path.name
    if data.get("screenshot"):
        summary["screenshot"] = data["screenshot"]
    return summary


def write_probe_outputs(structure_path: Path, data: dict[str, Any]) -> Path:
    structure_path.parent.mkdir(parents=True, exist_ok=True)
    structure_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    summary_path = summary_path_for(structure_path)
    summary = build_summary(data, structure_path)
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    return summary_path


def summarize_existing(path: Path) -> int:
    structure_path = path.expanduser().resolve()
    if not structure_path.exists():
        raise SystemExit(f"Structure probe does not exist: {structure_path}")
    data = json.loads(structure_path.read_text(encoding="utf-8"))
    summary_path = write_probe_outputs(structure_path, data)
    print(f"Summary rebuilt: {summary_path}")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Probe layout structure and styles from a page.")
    parser.add_argument(
        "target",
        nargs="?",
        help="Local HTML file, file:// URL, or http(s) URL. Omit with --summarize-only.",
    )
    parser.add_argument(
        "output",
        nargs="?",
        help="Output JSON path, usually source/probes/<state-id>.structure.json",
    )
    parser.add_argument("--width", type=int, default=1920, help="Viewport width")
    parser.add_argument("--height", type=int, default=1080, help="Viewport height")
    parser.add_argument(
        "--selector",
        action="append",
        dest="selectors",
        help="Additional CSS selector to probe. Can be passed multiple times.",
    )
    parser.add_argument("--limit", type=int, default=15, help="Max elements per selector")
    parser.add_argument("--screenshot", help="Optional screenshot output path")
    parser.add_argument(
        "--browser-executable",
        help="Optional local Chrome/Edge/Chromium executable path. Defaults to auto-detecting a system browser.",
    )
    parser.add_argument(
        "--wait-ms",
        type=int,
        default=1500,
        help="Extra wait after domcontentloaded for async UI (default 1500)",
    )
    parser.add_argument(
        "--summarize-only",
        metavar="STRUCTURE_JSON",
        help="Rebuild *.summary.json from an existing *.structure.json without launching a browser",
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

    if args.summarize_only:
        return summarize_existing(Path(args.summarize_only))

    if not args.target or not args.output:
        raise SystemExit("target and output are required unless --summarize-only is used")

    output = Path(args.output).expanduser().resolve()
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

    selectors = DEFAULT_SELECTORS + (args.selectors or [])

    probe_script = """
    ({ selectors, limit }) => {
      const textOf = (el, n = 120) => (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, n);
      const boxOf = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        };
      };
      const styleOf = (el) => {
        const s = getComputedStyle(el);
        return {
          display: s.display,
          position: s.position,
          flexDirection: s.flexDirection,
          gridTemplateColumns: s.gridTemplateColumns,
          alignItems: s.alignItems,
          justifyContent: s.justifyContent,
          gap: s.gap,
          overflow: `${s.overflowX}/${s.overflowY}`,
          color: s.color,
          backgroundColor: s.backgroundColor,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          padding: s.padding,
          margin: s.margin,
          border: s.border,
          borderRadius: s.borderRadius,
          boxShadow: s.boxShadow,
          zIndex: s.zIndex,
        };
      };
      const childSummary = (el) => [...el.children].slice(0, 8).map((child) => ({
        tag: child.tagName.toLowerCase(),
        className: String(child.className || "").slice(0, 80),
        text: textOf(child, 40),
        box: boxOf(child),
        display: getComputedStyle(child).display,
      }));
      const inferRelationships = (el) => {
        const controls = [...el.querySelectorAll("input,select,textarea,button,[role='button'],[role='combobox']")].slice(0, 12);
        const labels = [...el.querySelectorAll("label")].slice(0, 12);
        return {
          controlCount: controls.length,
          labelCount: labels.length,
          labelMode: labels.length ? "explicit-label" : controls.some((c) => c.getAttribute("placeholder")) ? "placeholder-only-or-mixed" : "unlabeled-or-text-button",
          controls: controls.slice(0, 6).map((control) => ({
            tag: control.tagName.toLowerCase(),
            type: control.getAttribute("type"),
            role: control.getAttribute("role"),
            placeholder: control.getAttribute("placeholder"),
            text: textOf(control, 40),
            box: boxOf(control),
            layout: styleOf(control),
          })),
        };
      };
      const bySelector = {};
      for (const selector of selectors) {
        const elements = [...document.querySelectorAll(selector)].slice(0, limit);
        if (!elements.length) continue;
        bySelector[selector] = elements.map((el) => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          className: String(el.className || "").slice(0, 120),
          inputType: el.getAttribute("type"),
          placeholder: el.getAttribute("placeholder"),
          role: el.getAttribute("role"),
          text: textOf(el),
          box: boxOf(el),
          layout: styleOf(el),
          relationships: inferRelationships(el),
          children: childSummary(el),
        }));
      }
      const landmarks = [...document.querySelectorAll("header,nav,aside,main,section,form,table,[role='tablist'],[role='dialog']")]
        .slice(0, 40)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          className: String(el.className || "").slice(0, 80),
          text: textOf(el, 60),
          box: boxOf(el),
          display: getComputedStyle(el).display,
        }));
      return {
        url: location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyTextSample: textOf(document.body, 300),
        },
        landmarks,
        bySelector,
      };
    }
    """

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
        page.goto(to_target(args.target), wait_until="domcontentloaded")
        if args.wait_ms > 0:
            page.wait_for_timeout(args.wait_ms)
        data = page.evaluate(probe_script, {"selectors": selectors, "limit": args.limit})
        if args.screenshot:
            screenshot = Path(args.screenshot).expanduser().resolve()
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot), full_page=False)
            data["screenshot"] = str(screenshot)
        browser.close()

    summary_path = write_probe_outputs(output, data)
    print(f"Structure probe saved: {output}")
    print(f"Summary probe saved: {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
