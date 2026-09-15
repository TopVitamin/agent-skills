# Control Sample Template

Embed in Page Map or `docs/clone-progress.md` under **Control Samples**.

Round-1 capture must sample **1–2 representative controls** from the filter/toolbar (one select/dropdown + one input when both exist). Each control uses **separate locked states**. Use names from the **source UI**, not skill defaults.

## State ID Naming

```text
<page-id>-default                    # page default, controls closed
<page-id>-select-<short-name>-open   # e.g. LIST-001-select-status-open
<page-id>-input-<short-name>         # e.g. LIST-001-input-search
<page-id>-menu-<short-name>-open     # row/toolbar action menu
```

## Per-Control Record

```markdown
### Status Filter Select

| Field | Value |
|---|---|
| State IDs | LIST-001-default (closed), LIST-001-select-status-open |
| Trigger | toolbar 2nd control, placeholder from source e.g. "请选择状态" |
| Closed box | h=30 w=160 border 1px #d8dde6 radius 2px |
| Open panel | w=160 anchor bottom-left of trigger, item h=32 |
| Interaction | click → menu; click option → label updates; outside click closes |
| Evidence | screenshots + summary.json for open state |
| Clone status | pending |
```

## Round-1 Minimum

| Page type | Sample in first capture pass |
|---|---|
| List with filters | 1 select/dropdown (open state) + 1 text/search input |
| List with only search | 1 input + 1 row/toolbar menu if visible |
| Form page | 1 input + 1 select/date picker |
| Dashboard / read-only | 1 nav/tab or filter if present; else mark N/A |
| No interactive controls | mark N/A; `static-seed` only |

Do not open every control on the page in round 1. Pick the **most representative** 1–2; mark others `pending` in Interaction Map.
