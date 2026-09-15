# Screenshot-Only Workflow

当用户只给截图、Appshot、录屏帧，或无法通过 Chrome/CDP/DOM 访问源系统时使用。

核心原则：可以做静态还原，但必须诚实标注证据等级。截图不能证明 DOM 结构、隐藏列、下拉内容、弹窗真实子结构、交互行为。

## Allowed Outputs

| 产物 | 是否允许 | 要求 |
|---|---|---|
| 静态 Page Map | 允许 | 标注 `sourceType: screenshot-only` |
| 静态 HTML/React 页面 | 允许 | 可运行但交互只能是模拟或 pending |
| 视觉近似 QA | 允许 | 源图 vs 克隆图对比，记录 top diff |
| 组件/tokens 草稿 | 允许 | 标注为 provisional，不进入正式 design-system |
| 高保真通过 | 禁止 | 无 DOM/CDP 不得标 `passed` |
| 真实交互还原 | 禁止 | 除非用户补充交互截图/录屏/DOM |

## Required Artifacts

```text
docs/clone-progress.md
docs/source-inventory.md
docs/evidence-gaps.md
docs/page-maps/<state-id>.md
source/screenshots/<state-id>.png
source/vision/<state-id>.vision-facts.md
qa/screenshots/
qa/iterations/
```

## Output Chain

截图识别后的产物必须分层，不能把估算和事实混在一起：

```text
source/screenshots/<state-id>.png
→ source/vision/<state-id>.vision-facts.md
→ docs/page-maps/<state-id>.md
→ docs/evidence-gaps.md
→ static implementation
→ qa/iterations/<state-id>-static-v1.md
```

| 文件 | 负责内容 | 禁止内容 |
|---|---|---|
| `vision-facts.md` | 截图中明确可见的事实、估算 token、unknowns | 交互行为推断、DOM 结构断言 |
| `page-map.md` | 实现输入，引用 visible / estimated / unknown 标记 | 把 estimated/unknown 改写成确定事实 |
| `evidence-gaps.md` | 需要用户、CDP、更多截图补齐的证据 | 泛泛写“待优化” |
| `static-v1.md` | 源图 vs 克隆图 top diff、静态 QA 状态 | `high-fidelity passed` |

`source/probes/*.summary.json` 不是必需；如果为了统一流程创建，必须包含：

```json
{
  "generatedBy": "screenshot-only-agent",
  "sourceType": "screenshot-only",
  "captureCompleteness": {
    "passed": false,
    "failedChecks": ["no DOM inventory", "no computed styles", "no interaction probe"]
  }
}
```

## Page Map Rules

先写 `source/vision/<state-id>.vision-facts.md`，再写 Page Map。Page Map 只能引用 `vision-facts.md` 中的可见事实和带标记的估算项。

| 区域 | 写法 |
|---|---|
| 可见标题/按钮/表头 | 直接记录 |
| 被截断表格列 | 标 `unknown-offscreen` |
| 下拉/弹窗未打开 | 标 `pending-state` |
| 颜色/尺寸 | 可估算，但标 `estimated-from-screenshot` |
| 交互行为 | 不推断；写 `pending-interaction` |

## Vision Facts Template

写入 `source/vision/<state-id>.vision-facts.md`，格式见 `references/templates/vision-facts.md`。不要在本文件重复模板。

## Evidence Gaps

写入 `docs/evidence-gaps.md`。每条 gap 必须说明影响，不写空泛待办。

```markdown
# Evidence Gaps

| State | Gap | Impact | Needed evidence | Status |
|---|---|---|---|---|
| <state-id> | hidden table columns | 无法确认完整列数 | 横向滚动截图或 DOM inventory | open |
| <state-id> | dropdown options | 无法还原下拉 open 态 | open-state 截图或 CDP click probe | open |
```

## Implementation Rules

1. 先实现截图中可见的 app shell、表格、表单、按钮、分页、弹窗。
2. 不新增截图里没有的侧栏、筛选区、操作列、卡片层级。
3. 所有不可见状态做成 `pending` 或 mock，不声称源站已验证。
4. `tokens.css` 可以先写 provisional token，命名避免和正式 source token 混淆，例如 `--shot-table-grid`。
5. 后续拿到 CDP/DOM 后，必须转入 `capture-runbook.md` 或 `incremental-page.md` 补证据，再晋升为 runnable/high-fidelity。
6. 实现前必须读 `vision-facts.md` 和 `page-map.md`；遇到 `unknown` 不得自行补全。

## QA Status

| 状态 | 条件 |
|---|---|
| `static-draft` | 页面能渲染，尚未对比 |
| `static-compared` | 已做截图对比，有 top diff |
| `static-close` | 可见布局接近，但无 DOM/交互证据 |
| `blocked-for-high-fidelity` | 需要 URL、Chrome tab、DOM、或更多状态截图 |

最终回复必须说明：

```text
这版是 screenshot-only 静态还原：可见布局已对齐到截图，但没有 DOM/交互证据，不能标高保真通过。
```
