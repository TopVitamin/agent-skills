# Clone Progress Template

Agent-maintained. User sees **用户状态** only.

```markdown
# Clone Progress

Updated: YYYY-MM-DD
Active page: <state-id>

## Clone Brief

| Field | Value |
|---|---|
| Goal | 要复刻的系统/页面/状态 |
| Operator task | 页面需要支持的操作员任务 |
| Source authority | URL / Chrome tab / screenshot / existing code |
| Route / state | route、默认态和交互态 |
| Viewport / theme | viewport、主题、登录态、动态内容约束 |
| Preserve | 结构、密度、文案、资产、交互和旧控件质感 |
| Out of scope | 改版、业务扩展、真实接口、发布 |
| Fidelity target | high-fidelity / runnable-baseline / static-only |
| Gaps | 未验证事实、资产或能力 blocker |

## 用户状态

（一句中文：做到哪、差什么、下一步）

## Capture capability

| Field | Value |
|---|---|
| Level | cdp-tab |
| Tool | web-access CDP :3456 |
| Matched tab | title + URL |
| Blocker | none |

## Runbook phase

| Phase | Status | Notes |
|---|---|---|
| 0 Preflight | done | |
| 1 app chrome tokens | done | source-css-vars.json, element-token-map.json, shell-tokens.json, surface-tokens.json |
| 2 Per-page capture (P2.1–P2.5) | done / in progress | see source-inventory |
| 2b Maps | done | Page Map + Interaction Map |
| 3 Implement | blocked / in progress | implement gate checklist |
| 4 Verify | pending | |

## Capture completeness

| Page | inventory | summary gate | shell | surface | Page Map |
|---|---|---|---|---|---|
| buy-list-default | yes | passed | shared | shared | done |

## Implement gate (Phase 3)

- [ ] tokens.css from source CSS var matches, then shell + surface probes
- [ ] AppShell from shell-tokens (not guessed)
- [ ] List columns === summary.tableColumns.length
- [ ] Surface layering (card plain/bordered, divider vs grid colors)
- [ ] Source content, mock data, visible assets and asset gaps are recorded
- [ ] Core Interaction Map states are implemented or marked pending
- [ ] npm run build passes

## Design QA gate

- [ ] route / viewport / theme / state / content are normalized
- [ ] source-versus-clone comparison completed
- [ ] typography / layout / colors / assets / copy / states / visible accessibility risks checked
- [ ] no unhandled P0/P1/P2, or accepted differences recorded

## Control Samples (round-1)

| Control | State ID | Open state | Status |
|---|---|---|---|
| 条/页 | buy-list-select-pagesize-open | yes | done |

## Blockers / Gaps

-

## Resume Instructions

1. Read runbook phase table + latest `qa/iterations/*-vN.md`
2. If Phase < 3 complete → continue runbook, do not code
3. If Phase 4 not passed → fix top diff from iteration note
```
