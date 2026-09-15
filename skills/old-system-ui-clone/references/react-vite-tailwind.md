# React + Vite + Tailwind Rules

Use this reference when creating or updating the clone project.

## Required Stack

- React
- Vite
- TailwindCSS
- `lucide-react` or another verified open-source SVG icon set for functional icons
- no Ant Design, Element Plus, shadcn/ui, Bootstrap, Material UI, or similar UI component libraries

Before adding an icon, verify the icon exists through installed package metadata or official documentation when available. If verification is unavailable, use a text label or simple CSS shape only as a documented asset gap, not as the default for an interactive baseline.

## Recommended Structure

```text
src/
  App.jsx
  main.jsx
  styles/
    index.css
    tokens.css
  components/
    shell/AppShell.jsx
    shell/TopNav.jsx
    shell/Sidebar.jsx
    data/DataTable.jsx
    data/Pagination.jsx
    form/SearchPanel.jsx
    form/Field.jsx
    feedback/StatusTag.jsx
    overlay/LegacyModal.jsx
  pages/
    ListPage.jsx
  data/
    mockData.js
docs/
  source-inventory.md
  sampling-status.md
  design-system.md
  page-registry.md
  page-maps/
source/
  screenshots/
  probes/
qa/
  screenshots/
  iterations/
```

Use this structure as a default, but adapt to an existing project without disruptive rewrites.

## Component Rules

### AppShell

- **Before coding:** read `source/probes/source-css-vars.json` + `element-token-map.json` when present, then `shell-tokens.json` + `surface-tokens.json`.
- Map shell tokens → `tokens.css` → `Sidebar` / `TopBar` / `AppShell` (see `implement-from-probes.md`).
- Preserve shell proportions before page details.
- Avoid oversized modern cards and decorative gradients.

### Surface Layering (ERP 常见)

- Gray **canvas** (`--canvas-bg`) — full content background.
- White **page-header** strip — toolbar; bottom border `--divider` (`#e8e8e8`).
- White **PageCard** `plain` — list table wrapper; no outer border; 8px padding; radius 2px.
- **PageCard** `bordered` — form sections; border `1px solid var(--divider)`.
- Table head fill `--table-head-bg` (`#e0e2e8`); cell grid `--table-grid` (`#ccc`) — not the same as control `--border` (`#d9d9d9`).
- Fixed footer bar on add/edit: white + top divider + subtle shadow from surface-tokens.

Reuse `components/shell/PageCard.jsx` pattern when present in project.

### SearchPanel

- Dense form layout.
- Controls should align by height.
- Labels should be predictable and compact.
- Keep primary and secondary buttons visually close to the source.
- Use real `button`, `input`, and controlled dropdown/popover components. Do not render controls as inert divs just to match a screenshot.

### Interaction Components

- Implement minimum useful state with React state, not static CSS classes.
- Tabs/status filters should change active state and, when reasonable, filter mock rows or update visible counts.
- Dropdowns, date pickers, toolbar menus, and row action menus should open from their source-like anchor and close on selection or outside click.
- Text/date inputs should accept typing and produce visible feedback when reasonable.
- Buttons that cannot execute real business logic should still provide safe demo feedback such as a toast, pending state, or opened menu.
- Keep interactions local and mock-only unless the user explicitly asks for live API integration.

### DataTable

- Table density is a core token, not a page detail.
- Preserve header height, row height, border color, column alignment, and action link style.
- Use explicit column definitions so later pages can reuse table behavior.

### Modal/Drawer

- Clone source dimensions, title bar, footer button alignment, overlay opacity, border, and shadow.
- Do not replace old modal style with modern rounded panels unless the source uses it.

## Tailwind Usage

- Put stable global values in `src/styles/tokens.css`.
- Use Tailwind classes for layout and most styling.
- Use CSS variables through Tailwind arbitrary values when it improves consistency:

```jsx
<div className="h-[var(--top-nav-height)] bg-[var(--color-primary)]" />
```

- Use small custom CSS only for repeated old-system details that Tailwind classes make noisy.
- Do not hide large amounts of styling in opaque CSS modules when the goal is reviewability.

## Data And Business Text

- Copy visible labels, fields, status text, table headers, and button copy from evidence.
- If screenshots are incomplete, fill with plausible data **matching the source domain** and mark assumptions.
- Keep mock data realistic enough to validate table density, wrapping, status colors, and actions.
- Include enough mock variants to verify interactions: at least two statuses, multiple filter dimension values when filters exist, and rows that can appear/disappear after search or tab changes.

## Verification Commands

Prefer the project's own scripts. Typical commands:

```bash
npm install
npm run dev
npm run build
```

Run `npm run build` or the repo's check command when project structure or shared components changed.

## Output Discipline

- Put captured source images in `source/screenshots/`.
- Put full DOM probes in `source/probes/*.structure.json` (archive only).
- Read `source/probes/*.summary.json` for layout evidence; do not load `*.structure.json` into context.
- Put target-state Page Maps in `docs/page-maps/`.
- Put default and interaction-state clone screenshots in `qa/screenshots/` for runnable baselines.
- Put short visual iteration notes in `qa/iterations/`.
- Update `docs/design-system.md` only after at least 2 different page types or 3 same-type states pass visual QA. Shared components can be adjusted earlier, but record them as page-local until the design-system gate is met.
