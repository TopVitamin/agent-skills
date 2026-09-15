# Design System Template

Read and write **only in `systemize` mode**, after Visual + Interaction Gate passes.

Evidence IDs should reference **actual sampled pages** from this project.

## docs/design-system.md

```markdown
# Legacy UI Design System

Status: seed | baseline | system | mature

## Structure Tokens

| Token | Value | Evidence | Notes |
|---|---|---|---|
| canvas-model | flat full-width | LIST-001 | no extra card wrappers |
| filter-grammar | placeholder-only toolbar | LIST-001 | no external labels |

## Global Layout

| Token | Value | Evidence |
|---|---:|---|
| --top-nav-height | 48px | LIST-001 |
| --sidebar-width | 220px | LIST-001 |

## Colors / Typography / Components

(abbreviated tables — one row per proven token)

## Assumptions

| Area | Assumption | Needs confirmation |
|---|---|---|
| Empty state | centered text in table shell | yes |
```

## src/styles/tokens.css

```css
:root {
  --font-body: Arial, "Microsoft YaHei", sans-serif;
  --color-page-bg: #f3f5f7;
  --color-border: #d8dde6;
  --top-nav-height: 48px;
  --sidebar-width: 220px;
  --table-row-height: 38px;
}
```

Rules:

- Shared tokens only after evidence repeats across pages.
- Mark status honestly; seed ≠ mature.
- Page exceptions stay in Page Maps, not hidden in global tokens.

Other registry templates: `source-inventory.md` row format in `references/templates/source-inventory.md`.
