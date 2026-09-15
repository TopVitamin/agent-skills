# Capture Preflight

Read at the start of live/logged-in source capture, or when the user says their browser tabs are already open.

Goal: pick the capture route in **under 30 seconds**. Do not burn minutes on routes that cannot see the user's session.

This file is platform-portable. Use the best equivalent capability available in the host agent; tool names below are examples, not requirements.

## Capability Ladder

| Level | Evidence allowed | Use when |
|---|---|---|
| `claim-tab` | live screenshot, DOM, styles | host exposes a browser-tab claim/control tool for the user's logged-in browser |
| `cdp-tab` | live screenshot, DOM, styles | Chrome/Edge remote debugging or a local CDP proxy can see the user's tab |
| `standalone-browser` | public/local screenshot and DOM | URL is public or local; no user session needed |
| `screenshot-only` | user-provided image/Appshot | no live browser/session access |
| `blocked` | none | login source exists but no session-capable route is available |

Route order for authenticated/private systems:

```text
claim-tab → CDP/remote-debugging → user screenshot/Appshot
```

Standalone Playwright/browser automation is only for public/local targets or local clone QA; it does not see the user's existing cookies.

## Hard Rule: Preflight Before Probe

Before screenshot, DOM probe, or Playwright `goto` on an authenticated URL:

1. Run capability detection (below).
2. Record result in `docs/clone-progress.md` → `Capture capability`.
3. If not `claim-tab` or `cdp-tab`, **stop authenticated capture** and give the user **one** unblock action — then scaffold the project in parallel if useful.

**Forbidden before preflight completes:**

| Do not | Why |
|---|---|
| `playwright_navigate` / `capture_page.py` on login-required URL | Isolated context, no user cookies |
| Cursor in-app browser `browser_navigate` on enterprise URL | Same — hits login wall |
| AppleScript / `list_chrome_tabs_macos.py` as proof of access | Metadata only; 0 windows is common under sandbox |
| Install Playwright browsers to "try anyway" | Does not fix missing session |
| Multiple port scans + cookie DB reads | Slow; does not replace CDP |
| Ask user for screenshots before CDP/plugin failed once | Only after preflight says `screenshot-only` |

Acceptable parallel work while user enables session-capable capture: create project dirs, initialize `clone-progress.md`, or organize user-provided URLs/screenshots.

## Capability Detection (run in order)

### Step 1 — Host browser capability (`claim-tab`)

If the environment exposes browser tab claim/control tooling for the user's logged-in browser, use it → level = `claim-tab`. Done.

If the user explicitly asked for the in-app Browser on a **local** target (`localhost`, `127.0.0.1`, `file://`), Browser is acceptable for clone QA. Do **not** use it to capture authenticated enterprise pages unless it is already the user's active logged-in browser context.

If no claim-tab/browser capability is available: skip immediately. Do not retry.

### Step 2 — CDP / remote debugging (`cdp-tab`)

Use the first available route. Examples:

| Route | Command / check |
|---|---|
| Skill-local fallback | `bash scripts/capture_preflight.sh` |
| Host-provided CDP helper | run the platform's CDP preflight/check command |
| Existing proxy | `curl -s http://localhost:3456/targets` |

When a host helper exists, follow it. For example:

```bash
node <host-cdp-helper>/check-deps.mjs
```

| Output | Level | Next |
|---|---|---|
| `chrome: ok` + `proxy: ready` | `cdp-tab` | `curl -s http://localhost:3456/targets` → match user URL/title |
| `chrome: not connected` | blocked | User action below; **stop authenticated capture** |

When only `capture_preflight.sh` is available, use its `capability:` line:

| Output | Level | Next |
|---|---|---|
| `capability: cdp-tab` | `cdp-tab` | `/targets` → match user URL/title |
| `capability: blocked` | blocked | User action below; **stop authenticated capture** |

**Match open tab** (prefer existing tab over `/new` for default-state capture):

```bash
curl -s http://localhost:3456/targets
# pick targetId where url or title matches
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/state.png"
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'
```

Screenshot save path: use `/tmp/*.png` then `cp` into `source/screenshots/` (spaces in project paths break some proxy callers).

Poll the chosen CDP check at most **3 times / 15s** while user enables debugging — then stop and report.

### Step 3 — User-provided evidence

If CDP/plugin unavailable: level = `screenshot-only`. Request Appshot/files under `source/screenshots/`. Do not guess layout from login pages.

### Step 4 — Public URL only

No login on target URL: level = `standalone-browser` → `scripts/capture_page.py` / Playwright OK.

## User Unblock (CDP) — say this once

When the browser/session route is not connected, reply in plain Chinese and name the host-specific action if known:

> 我这边还连不上你 Chrome 的调试端口，所以读不到你已登录的 Tab。请在本机 Chrome 打开 `chrome://inspect/#remote-debugging`，勾选 **Allow remote debugging**（有弹窗点允许）。完成后跟我说一声「好了」，我立刻从现有 Tab 截图采集。

If the platform has a different browser-claim setup, replace the Chrome-specific sentence with that setup. Optional one-liner for user prep before a clone session:

> 克隆前请保持目标页面 Tab 已打开并已登录；Chrome 开启远程调试。

Do **not** list Playwright, AppleScript, or IDE browser as alternatives for logged-in capture.

## CDP Capture Recipe (logged-in pages)

Follow **`references/capture-runbook.md`** for full order. Summary below is Phase 1–2 only.

| Step | Action |
|---|---|
| 1 | `/targets` → match URL or title |
| 2 | `/screenshot` default state → `source/screenshots/<state-id>.png` |
| 3 | Run `node scripts/cdp_page_inventory.mjs --target=ID --state-id=<id> --out source/probes/<id>` (scrolls long pages, lists all table cols / form labels) |
| 4 | Verify `*.summary.json` → `captureCompleteness.passed === true`; else fix and re-run |
| 5 | `/click` one dropdown → screenshot `*-select-*-open` + menu box/styles in probe or Page Map |
| 6 | Close only tabs **you** created with `/close`; never close user tabs |

**Forbidden:** hand-writing `*.summary.json` from a single ad-hoc `/eval`. Do not load full `*.inventory.json` / `*.structure.json` into agent context.

If the host provides its own `/eval`, `/click`, `/screenshot`, or browser-control API, follow that API. This file only adds clone-specific gates and file layout.

## Environment Matrix

| Environment capability | First route | Second | Do not use for login |
|---|---|---|---|
| Has logged-in tab claim tool | claim-tab | CDP | standalone browser on auth URL |
| Has CDP/remote-debugging proxy | CDP | user screenshots | standalone browser on auth URL |
| Has only in-app/browser sandbox | standalone browser for public/local QA | screenshots | auth URL capture |
| CLI/sandbox with no browser session access | screenshots | public URL only | any "open my tab" promise |
| Static image only | screenshot Page Map | — | live URL |

## Record in clone-progress

```markdown
## Capture capability

| Field | Value |
|---|---|
| Level | cdp-tab |
| Tool | web-access CDP proxy :3456 |
| Matched tab | 我的供应商 — https://stage.example.com/... |
| Blocker | none |
```

If blocked: set `Blocker` to the single user action; Phase stays `1-capture` until resolved.

## Speed Checklist (agent)

- [ ] Preflight run first command within 10s
- [ ] Capability level written before first screenshot
- [ ] Existing user tab matched by URL/title before `/new`
- [ ] No Playwright install/navigation on auth URL
- [ ] Project scaffold parallelized while user fixes CDP (optional)
