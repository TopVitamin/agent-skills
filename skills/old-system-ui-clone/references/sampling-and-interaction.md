# Sampling And Interaction

Read for runnable high-fidelity pages, strengthened single-page states, or multi-page clone planning.

## Sampling Gate

| Level | Evidence | Allowed output |
|---|---|---|
| Static direction | 1 default screenshot | visual direction, rough Page Map; **not** high-fidelity passed |
| Runnable high-fidelity page | default + ≥2 interaction states on target page | runnable page, Interaction Map, QA screenshots |
| Reusable baseline | 3–5 pages/states incl. interactive list | reusable Demo, `tokens.css`, shared shell |
| System | 5–8 pages/states | design-system baseline, multi-page plan |
| Mature | 10+ pages/states | stable component library |

For a **multi-page baseline** (any legacy admin/business system), sample at least: dashboard/home, one list or index page with filters + main content + pagination, detail/drawer, form/modal, one interaction state (dropdown, confirm, empty, error). Adapt page types to the source — not every system has warehouses or inventory.

List page — **round-1 required:** 1 select/dropdown (closed + open state) + 1 input when visible. **Later rounds:** tab/status switch, row/toolbar action, selected rows / empty / loading / validation.

**Modals (incremental):** separate state-id per modal; CDP open + DOM probe before implement — see `incremental-page.md` and `evidence-trust.md`. Default-page inventory does not prove modal layout (e.g. left sidebar).

Static screenshots only → `static visual seed`; not enough for interactive baseline unless user explicitly wants non-interactive prototype.

## Interaction Map

Create before any runnable baseline. Template: `references/templates/interaction-map.md`.

| Control | Source behavior | Clone behavior | Verification |
|---|---|---|---|
| Status/tab | active + content change | mock filter/count update | click → table changes |
| Dropdown | opens from trigger | same anchor, selectable | click → menu visible |
| Input/search | affects visible state | filter rows or pending note | type → visible response |
| Row/toolbar action | menu near button | menu + close behavior | click → menu position |
| Empty/loading | specific state or pending | implement or mark pending | screenshot or note |

Minimum bars:

- Static direction — Interaction Map optional; must be labeled static.
- Runnable high-fidelity page — ≥1 tab/switch, ≥1 dropdown/menu/popover, ≥1 input or table action when visible in source.
- Strengthened page — tab, dropdown, input/filter, row action, + one secondary state (selected, empty, modal, etc.) when evidence exists.

## First Demo Readiness

Start first runnable Demo when:

- Shell dimensions known: top nav, sidebar, content padding.
- Core tokens known: font, text colors, backgrounds, borders, primary/action, radius.
- List demos: table header/row height, borders, action links, filter height, pagination.
- Round-1 control samples: at least one select/dropdown open state + one input with border/height captured in `controlSamples` or Page Map.
- ≥1 interaction state sampled or marked pending.
- Interaction Map exists for runnable outputs.
- Functional icons: verified SVG or documented gaps.
- ≥1 real state change in clone (tab filter, search, menu selection, toast).
- Target page has source screenshot or live evidence.
- Uncertain values recorded, not silently normalized.

Narrow Demo is allowed only if minimum interactions work; otherwise label it static direction, not high-fidelity passed.

## Page Sampling Matrix

| Type | Min | Extract |
|---|---|---|
| Dashboard | 1 | shell, nav, cards, spacing |
| List default | 1 | tabs, filters, table, pagination, actions |
| List interactions | 2–4 states | tab, dropdown, search, row action, empty |
| Detail/drawer | 1 | field layout, sections, status |
| Form/modal | 1 | labels, footer buttons, validation |
| Dropdown/actions | 1 | menu size, hover, disabled |
| Empty/error/loading | 1 | placeholder, alert, loading surface |

Stop extraction when tokens repeat across pages, source is blocked, or resolution is too low. For a reusable system baseline, do not stop at two pages unless user accepts seed-level output.
