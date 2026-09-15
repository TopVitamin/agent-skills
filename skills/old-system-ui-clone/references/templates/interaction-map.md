# Interaction Map Template

Embed in Page Map or as `docs/page-maps/<state-id>-interactions.md`. Keep ≤15 rows. Use **labels and behavior from the source system**.

```markdown
## Interaction Map

| Control | Source behavior | Clone behavior | Verification | Status |
|---|---|---|---|---|
| Status tab | active underline, filters rows | active class + mock filter | click → row count changes | pending |
| Filter select | dropdown from trigger | anchored menu, select value | click → label updates | pending |
| Search input | filters table on enter | controlled input + filter | type → rows change | pending |
| Row ⋮ action | menu below icon | popover at anchor | click → menu opens | pending |
| Column settings | right popover | same anchor | click → panel visible | pending |
```

Minimum for `interactive-baseline-v0`: one tab/switch, one dropdown/menu, one input or row action when visible in source.

Mark unsampled controls `pending` with reason — do not invent behavior.
