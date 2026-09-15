# Iteration Note Template

Use for `qa/iterations/<state-id>-v1.md`. **Top 3 differences only** — no long reports.

```markdown
# Visual Iteration: <state-id> v1

| Field | Value |
|---|---|
| Phase | 4-verify |
| QA iteration | v1 |
| Chat session | 1 |
| Source | source/screenshots/<state-id>-default.png |
| Clone default | qa/screenshots/<state-id>-clone-v1.png |
| Clone interaction | qa/screenshots/<state-id>-clone-v1-menu.png |
| Viewport | 1920x1080 |
| Status | not passed |

## Top Differences

| Rank | Difference | Fix |
|---|---|---|
| 1 | Filter toolbar wrapped in card; source is flat | remove card, match y=111 |
| 2 | Sidebar active block 4px short | height 36→40px |
| 3 | Dropdown centered not anchored | position from trigger ref |

## Interaction Checklist

| Control | Pass |
|---|---|
| Status tab | fail — no row change |
| Filter dropdown | pass |

## Remaining Gaps

- logo asset unavailable
- date picker interaction pending sample
```

After 2 auto-iterate rounds without pass, stop and list remaining gaps; do not claim complete.
