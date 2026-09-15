# Capture Completeness

Read during Phase 2 capture and before entering Phase 3 implementation.
**Orchestration:** `references/capture-runbook.md` (step order).
**Implementation mapping:** `references/implement-from-probes.md`.

**Core rule:** Context budget limits what enters the *chat* — it does **not** permit thin evidence on disk. A 2 KB hand-written `summary.json` with 5 regions is a **failed capture**, not a valid summary.

## Anti-Patterns (forbidden)

| Do not | Why |
|---|---|
| Hand-write `*.summary.json` from one ad-hoc `/eval` | Drops table columns, off-screen sections, icon counts |
| Skip `*.structure.json` or `*.inventory.json` | No archive to grep when summary is wrong |
| Use first-screen screenshot as full page inventory | ERP forms/tables scroll; below-fold blocks are real UI |
| Jump to `3-implement` with only round-1 control samples | Control samples ≠ page inventory |
| Treat «fast first render» as «minimal capture» | Speed applies to **coding**, not **evidence** |

`capture-preflight.md` CDP route must produce machine-generated probe files — not agent prose.

## Required Artifacts Per Page State

For each `<state-id>` (at minimum `*-default`):

| Artifact | Required | Purpose |
|---|---|---|
| `source/screenshots/<state-id>.png` | yes | visual lock |
| `source/probes/<state-id>.structure.json` **or** `*.inventory.json` | yes | full archive / CDP inventory |
| `source/probes/<state-id>.summary.json` | yes | derived from archive — **not hand-written** |
| `docs/page-maps/<state-id>.md` | yes | generated draft from summary, then human-corrected structure map |

Round-1 control states (`*-select-*-open`, etc.) add screenshots + open-state menu styles in summary or sibling probe file.

## Capture Completeness Gate

**Do not start `3-implement` until every checked item passes for the active page.**

### A. Archive exists

- [ ] `*.structure.json` exists (Playwright/plugin), **or**
- [ ] `*.inventory.json` exists (CDP) and records `generatedBy: cdp-page-inventory`

### B. Summary derived from archive

- [ ] `*.summary.json` lists `structureArchive` or `inventoryArchive` filename
- [ ] `captureCompleteness.passed === true` **or** explicit `failedChecks[]` with user-visible gaps

### C. Shell tokens (mandatory before shell coding)

Probe **once per app shell** (sidebar + top header/tabs) and save `source/probes/shell-tokens.json`:

| Token | Examples |
|---|---|
| `sidebar.width`, logo box | 100px, 80×65, background-image URL |
| `sidebar.menuItemHeight`, layout | 43px, icon-left-inline vs icon-top |
| `header.height`, `tabsTop`, tab card styles | 64px, 24px, inactive/active bg+border |
| `content.paddingLeft`, `pageHeaderHeight` | 16px, 49px |
| `table.theadBg`, `theadHeight` | #e0e2e8, 42px |

**Forbidden:** guessing shell dimensions from screenshot or generic admin templates. If shell probe missing, block `3-implement` for shell components.

CDP recipe: dedicated `/eval` on `.ant-layout-sider`, `.ant-layout-header`, `.ant-tabs-tab`, `.menu li a`, first `th` — see `scripts/cdp_page_inventory.mjs` shell section or manual `shell-tokens.json`.

### C2. Surface tokens (mandatory before page chrome coding)

Save `source/probes/surface-tokens.json` per app or page group:

| Surface | Probe selectors |
|---|---|
| Canvas | `.ant-layout` parent bg |
| Page header / toolbar strip | `.page-header` bg + `border-bottom` |
| Content card plain | `.ant-card` without border (list table wrap) |
| Content card bordered | `.ant-card-bordered` border color |
| Table head / grid | `.ant-table-thead th`, `.vxe-header--column` borders |
| Section divider | section title `border-bottom` |
| Footer action bar | fixed bottom bar `border-top` + `box-shadow` |

**Forbidden:** one `--border: #d9d9d9` for everything — source uses `#e8e8e8` dividers, `#cccccc` table grid, `#e0e2e8` head fill separately.

### D. Page inventory minimum fields

`summary.json` (or linked `inventory.json`) must include:

| Field | List pages | Form/detail pages |
|---|---|---|
| `elementCounts.totalVisibleNodes` | required | required |
| `elementCounts.tableHeaders` | required | if table present |
| `tableColumns[]` | **all** headers: `text`, `width`, `hasSort`, `hasFilter` | product/grid cols |
| `toolbarButtons[]` | all visible toolbar actions | all section toolbars |
| `formLabels[]` | filter labels if any | **all** form labels in DOM |
| `sectionTitles[]` | — | all `h1–h4` / section headers after scroll |
| `keyRegions[]` | ≥6 regions with `box` | ≥8 regions with `box` |
| `controlSamples[]` | ≥8 deduped controls | ≥12 deduped controls |
| `document.scrollHeight` | required | required — must scroll probe if `scrollHeight > innerHeight` |

### E. Scroll & horizontal coverage

- [ ] **Vertical:** CDP `/scroll?direction=bottom` (or equivalent) before inventory on form/detail pages; re-run inventory or merge `belowFold` sections into summary
- [ ] **Horizontal:** For tables wider than viewport, inventory must list **all** `<th>` / header cells from DOM — not only columns visible in screenshot
- [ ] Record `horizontalScroll: true` on list/table pages when `scrollWidth > innerWidth`

### F. Page Map reflects inventory

- [ ] Page Map row count ≥ `keyRegions` count (structure areas)
- [ ] Table column list in Page Map matches `tableColumns[]` length (mark off-screen cols «横向滚动»)
- [ ] Interaction Map lists sampled + `pending` controls — no silent omission

## CDP Route (logged-in Chrome)

Playwright `probe_structure.py` uses an isolated context — **do not use it for authenticated URLs**.

Use:

```bash
node scripts/cdp_page_inventory.mjs --target=TARGET_ID --state-id=buy-list-default \
  --out source/probes/buy-list-default
```

Or equivalent `/eval` that writes the same schema. Steps:

1. `/targets` match user tab
2. `/screenshot` → `source/screenshots/<state-id>.png`
3. `/scroll?direction=bottom` on long pages → wait → inventory eval
4. `/scroll?y=0` restore
5. Write `*.inventory.json` + derive `*.summary.json` via script or `build_summary` merge
6. Run `scripts/generate_page_map.mjs` to create the Page Map draft
7. Round-1: open one dropdown → screenshot + menu box/styles

## Summary Size Guidance

| File | Expected size | Red flag |
|---|---|---|
| `*.summary.json` | ~3–15 KB | <2 KB on ERP list/form page |
| `*.inventory.json` | ~5–40 KB | missing `tableColumns` / `formLabels` |
| `*.structure.json` | 50–300 KB | absent on live capture |

A «small summary» is OK in **chat context** only when the **disk archive** is complete.

## Implement Blocker Message

If capture gate fails, tell the user in plain Chinese:

> 采集证据不够，还不能开始写页面。缺：〈具体项，如 shell-tokens、22 列表头、surface 卡片色〉。我先按 runbook 补 probe 再继续实现。

Do not scaffold a «guess clone» to save time.

## Implement Gate (Phase 3)

Before first line of `src/pages/*.jsx`:

| Check | Source |
|---|---|
| `source-css-vars.json` exists when Phase 1 was freshly run | Phase 1 |
| `element-token-map.json` exists when Phase 1 was freshly run | Phase 1 |
| `shell-tokens.json` exists | Phase 1 |
| `surface-tokens.json` exists | Phase 1 |
| Every user URL has `*.summary.json` with `captureCompleteness.passed` | Phase 2 |
| `docs/source-inventory.md` rows complete | Phase 2 |
| Page Maps list full column/label counts | Phase 2b |
| Agent read `implement-from-probes.md` | Phase 3 |

## Record in clone-progress.md

```markdown
## Capture completeness

| Page | Archive | Summary derived | Scroll probe | Cols/forms | Gate |
|---|---|---|---|---|---|
| buy-list-default | inventory.json | yes | n/a | 22 cols | passed |
| buy-add-default | inventory.json | yes | yes | 15 labels / 14 cols | passed |
```
