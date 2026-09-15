# Page Map Template

Use for `docs/page-maps/<state-id>.md`. Keep ≤40 lines. Derive from `*.summary.json` + screenshot — not from full `*.structure.json`.

Use page names, labels, and state-ids from the **source system** under clone.

```markdown
# Page Map: <state-id>

## Source Lock

| Field | Value |
|---|---|
| Source | source/screenshots/<state-id>.png or URL |
| Page/state | e.g. order list, column settings popover open |
| Viewport | 1920x1080 |
| Included | only states visible in source |
| Excluded | e.g. export dropdown not in this pass |

## Structure Map

| Area | Position/size | Layout grammar | Visible controls | Implementation |
|---|---|---|---|---|
| Top nav | x=0 y=0 w=1920 h=48 | horizontal shell | logo, tabs, user | tabs in dark top shell |
| Sidebar | x=0 y=48 w=170 h=… | vertical icon menu | groups, active block | full-width active item |
| Filter toolbar | x=… y=… w=… h=80 | flat toolbar, no labels | segmented, selects, search | no label-input rows |
| Main content | x=… y=… w=… h=… | table-first or card grid | columns, actions | dominates viewport |
| Popover | x=… y=… w=… h=… | anchored right | checkbox grid, footer | align to trigger |

## Structure Notes

| Item | Observation | Implication |
|---|---|---|
| Canvas | flat full-width, not card stack | no wrapper cards |
| Filter grammar | placeholder-only | no external labels |
| Content anchoring | pagination bottom | avoid inset panel |

## Control Samples (round-1)

| Control | State IDs | Closed styles | Open styles | Interaction |
|---|---|---|---|---|
| Status select | default + select-status-open | h=30 border 1px #d8dde6 | menu w=160 item h=32 | click → select → label updates |

From `*.summary.json` → `controlSamples`. Template: `control-samples.md`.

## Confidence

| Area | Confidence | Notes |
|---|---|---|
| Sidebar width | high | from probe summary |
| Input border | high | from controlSamples |
| Popover x | medium | estimate from screenshot |
```

Screenshot-only: add a Confidence column per row; mark estimates explicitly.
