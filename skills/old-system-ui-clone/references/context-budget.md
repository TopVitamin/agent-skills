# Context Budget

Keep agent context small. Archive full evidence on disk; feed the model summaries and short docs only.

High-fidelity optimization means:

| Preserve | Optimize |
|---|---|
| screenshots, inventory/structure archives, control states, source-vs-clone QA | repeated reads, repeated prose, repeated probes, full-page vision on every iteration |

Never make the clone faster by collecting less source evidence.

## What Stays Off-Context

| Asset | Typical size | Rule |
|---|---|---|
| `*.structure.json` | 50 KB–300 KB+ | **Never** read the full file into context |
| Chrome `browser_snapshot` YAML | 5 KB–30 KB+ | Do not paste full snapshot; extract Page Map rows |
| Long `design-system.md` | 2 KB–8 KB | 仅在沉淀规范时写入；采集和首版实现时不要读取 |
| Generated React pages | grows per iteration | Read only files you are editing, not the whole tree each round |

## What Enters Context

| Asset | When | Limit |
|---|---|---|
| `*.summary.json` | After probe or Chrome DOM capture | Full file OK (~2–8 KB) |
| `docs/page-maps/<state-id>.md` | Before and during implementation | Primary input; keep ≤40 lines |
| `docs/.../interaction-map` section | Runnable baselines | ≤15 rows |
| Source screenshot | First visual gate or source state changed | 1 locked full-page screenshot |
| Clone screenshot | Visual gate | 1 full-page per iteration |
| Region crops | Detail fixes only | toolbar, table header, popover — max 3 crops per iteration |
| `qa/iterations/*.md` | After each iteration | Top 3 differences + pass/fail only |

## Probe Handling

1. Run probe (script or Chrome plugin) → save full `*.structure.json` to disk.
2. Read **only** `*.summary.json` for layout grammar, landmarks, key regions, style samples.
3. Generate `docs/page-maps/<state-id>.md` from summary + screenshot, then correct only missing judgment.
4. If one value is missing from summary, use targeted lookup in `*.structure.json` (one selector/landmark), not a full-file read.

`scripts/generate_page_map.mjs` creates the Page Map draft from `*.summary.json`:

```bash
node scripts/generate_page_map.mjs source/probes/<state-id>.summary.json docs/page-maps/<state-id>.md
```

`scripts/probe_structure.py` writes both probe files automatically. If only `*.structure.json` exists, run:

```bash
python scripts/probe_structure.py --summarize-only source/probes/<state-id>.structure.json
```

Or regenerate the probe.

## Vision Context Budget

This table limits what enters model vision/context. It does **not** reduce source screenshot files saved on disk. Required source screenshots still follow `capture-completeness.md`.

| Situation | Full-page screenshots in context | Crops |
|---|---|---|
| Evidence capture | 0–1 source preview | optional |
| First runnable QA | source + clone default | +1 interaction state crop if needed |
| Iteration round | clone only (source already locked) | up to 2 crops for failing regions |
| Auto iterate cap | **2 rounds** before reporting `not passed` + remaining gaps | — |

Use `scripts/compare_screenshots.py` for side-by-side PNG on disk. Describe differences in the iteration note; do not re-upload the comparison image to vision unless a region is unclear.

## Reference Loading

Do not read all `references/` at skill start. Use the routing table in `SKILL.md`.

Forbidden at skill start:

- `templates/design-system.md`，除非正在沉淀规范
- `sampling-and-interaction.md`，除非正在规划多页采样或交互门槛
- `qa-checklist.md` unless implementing or iterating

## Document Size Limits

| Doc | Max useful size |
|---|---|
| Page Map | ~40 lines |
| Interaction Map | ~15 rows |
| Iteration note | top 3 diffs + status |
| `source-inventory.md` | 1 row per sampled state |
| `design-system.md` | after ≥2 different page types or ≥3 same-type states pass QA |

## Effect Preservation

This budget does **not** reduce evidence collection. It only prevents dumping archives into context.

## Cache And Reuse

| Artifact | Reuse rule |
|---|---|
| `source-css-vars.json` | Reuse within the same source system unless theme root or runtime theme changed |
| `element-token-map.json` | Reuse with shell/surface unless key shell/table/card selectors changed |
| `shell-tokens.json` | Reuse within the same source system unless sidebar/topbar changed |
| `surface-tokens.json` | Reuse within the same theme/page family unless table/card/input surfaces visibly changed |
| `docs/page-maps/*.md` | Regenerate only when summary changed; otherwise edit the existing map |
| source screenshot | Reuse locked screenshot across QA rounds; capture a new one only when source state changed |
| clone screenshot | Capture each iteration; after round 1, prefer crops for top diff regions |

**Common failure:** agent writes a tiny hand-made `summary.json` (~40 lines) and skips `structure`/`inventory` because «summary is enough for context». That violates `capture-completeness.md`. Minimum on-disk evidence per page:

- `*.inventory.json` or `*.structure.json`
- `*.summary.json` with `captureCompleteness.passed`, `tableColumns` / `formLabels`, `elementCounts`

Hard gates: Source Lock, **Capture Completeness**, Page Map, Visual + Interaction Gate.
