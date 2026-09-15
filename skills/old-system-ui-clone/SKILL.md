---
name: old-system-ui-clone
description: >
  老系统、竞品后台、ERP/WMS/CRM/OA/MES 等企业后台页面克隆与精细还原。
  Use when the agent must capture source UI evidence from legacy/internal/admin systems
  using Chrome/CDP/DOM probes, screenshots, computed styles, design tokens, Page Maps,
  interaction states, then implement or iterate a faithful React + Vite + Tailwind clone
  without modernizing or replacing the source with a generic admin template.
  Also use for incremental page cloning, evidence-only capture, screenshot-only static
  reconstruction, visual QA, interaction QA, asset/state evidence, and design-system
  extraction from verified legacy UI clones. Do not use it to silently redesign or
  modernize the source; route those requests to a product-design workflow.
  Triggers: 老系统克隆、页面还原、竞品 UI、后台复刻、企业后台、ERP、WMS、CRM、OA、MES、DOM 探针、CDP 采集、视觉验收、design-system 沉淀.
---

# Old System UI Clone

## Core Contract

这个 skill 只优化一件事：**把源系统 UI 复刻得像，并且证据可回溯**。

| Always | Never |
|---|---|
| 先采集源系统证据，再写实现 | 凭截图、vision 描述或后台先验猜结构 |
| 保留老系统密度、表格节奏、灰底/白面分层、旧控件质感 | 现代化、美化、套通用 Admin 模板 |
| 把截图、DOM/inventory、computed style、Page Map、QA 结果落盘 | 只在聊天里描述“看起来差不多” |
| 证据不足时降级标注 | 把静态截图还原说成高保真可交互 baseline |

页面名、`state-id`、mock 数据、文案必须从源系统派生。源站未出现的行业词、字段、侧栏、弹窗结构不得补造。

对用户用中文自然语言说明进度；磁盘上的路径、脚本名、`state-id` 保持英文约定。

## Task Boundary and Clone Brief

先读 `references/router.md` 和 `references/clone-brief.md`。在采集或写代码前，回放最小 Clone Brief：目标页面、操作员任务、source authority、route/state、viewport/theme、本轮范围、必须保留和明确不做的内容。

`clone/recreate/match` 进入本 Skill；`audit/review` 默认只读；`improve/better/redesign/现代化` 不得被悄悄翻译成忠实复刻或反过来。信息已足够时直接记录假设继续，只问会阻塞结果的一个问题。

## Start Here

每次触发后先判断用户意图，再只加载对应 reference。

| 用户意图 / 当前状态 | 读取文件 | 行为 |
|---|---|---|
| 每次新建或恢复克隆任务 | `references/router.md`, `references/clone-brief.md` | 先确定任务边界、source authority 和 fidelity target |
| 新系统 / 新 URL / 用户说“克隆这个系统/页面” | `references/capture-runbook.md` | Phase 0–2b 采集完整证据；除非用户只要分析，否则继续实现和 QA |
| 已有项目继续做下一页/弹窗/模块 | `references/incremental-page.md`, `references/evidence-trust.md` | 复用已有 shell/surface/design-system，只采新 state |
| 用户只给截图、Appshot，或 CDP/Chrome 不可用 | `references/screenshot-only.md` | 做静态证据包或静态还原；不得标高保真通过 |
| 用户说“先采集/先分析/不写代码” | `references/capture-runbook.md` | 停在证据包 + Page Map，不创建或修改 `src/` |
| 已有 probes，要开始写代码 | `references/implement-from-probes.md`, `references/react-vite-tailwind.md` | 从 probes/Page Map 实现，不从想象实现 |
| 用户说“不够像/再调调/验收一下” | `references/qa-checklist.md` | 源 vs 克隆截图，对 top diff 迭代 |
| 准备沉淀组件规范/design-system | `references/templates/design-system.md`, `references/react-vite-tailwind.md` | 至少 2 个不同页面类型或 3 个同类状态通过后再沉淀 |
| 用户说“改得更好看/现代化/重新设计” | `references/router.md` | 先确认是否仍要忠实复刻；否则转 Product Design 改版流程 |

不要预读全部 `references/`。只读当前路径必需文件；脚本可直接运行，除非需要修脚本才读源码。

## Workflow States

内部状态写入目标项目的 `docs/clone-progress.md`，不要要求用户说 Phase。

| State | 进入条件 | 可交付内容 | 禁止声称 |
|---|---|---|---|
| `evidence-only` | 用户只要采集/分析 | source screenshots、probes、Page Maps、source-inventory | 已完成可运行克隆 |
| `screenshot-only` | 只有图片或无法访问 DOM/CDP | 静态 Page Map、静态页面、明确 gaps | 高保真、DOM 级还原、交互已验收 |
| `runnable-baseline` | Phase 0–2b 通过并实现 | 可运行 React baseline + 至少 1 个真实交互/state | 视觉已通过，除非 Phase 4 passed |
| `iteration` | 已有 baseline，用户要求调像 | top diff 迭代、QA note | 无证据重构整页 |
| `design-system` | 已有足够通过页面 | tokens/components 规则沉淀 | 从单页偶然样式提炼全局规则 |

## Hard Gates

| Gate | Rule |
|---|---|
| Clone brief | 采集或实现前必须记录目标、操作员任务、source authority、scope、preserve/out-of-scope 和 gaps |
| Source lock | 每个 state 必须锁定源 URL/截图、route、viewport、theme、时间或迭代标签 |
| Preflight first | 登录态/内网页面先走 `references/capture-preflight.md`；不可直接用 Playwright 猜登录页 |
| Evidence before code | 新 clone 写 `src/` 前必须有截图、inventory/summary、Page Map、shell/surface tokens |
| Machine summary | `*.summary.json` 必须由脚本或带 `generatedBy` 的 probe 生成；手写 summary 不得标 `passed` |
| Structure before style | 布局、列数、弹窗子结构以 CDP/inventory 为准，再调颜色和间距 |
| Asset/content boundary | 可见资产、文案和 mock 数据必须有来源或 gap 记录；不得把私有数据、未授权素材或未观察到的业务规则带入交付物 |
| Interaction gate | 可运行 baseline 每页至少 1 个可点控件，且有可见状态变化或明确 pending |
| Visual gate | 未做源 vs 克隆截图对比时，只能说“已实现首版”，不能说“已完成克隆” |
| Normalized QA | 比较前必须对齐 route、viewport、theme、state、内容、crop/scale 和浏览器外壳；P0/P1/P2 未处理时不能通过 |
| Static exception | 无 URL/无 CDP 可静态还原，但状态必须是 `screenshot-only` 或 `static-only` |

## Evidence Priority

当来源冲突时按这个顺序取信：

```text
CDP eval / DOM probe
→ machine-generated inventory / summary
→ locked source screenshot
→ clone screenshot / visual comparison
→ model prior knowledge
```

结构性决策只信前两层。是否有左栏、弹窗几列、表格多少列、footer 按钮是什么，都不能靠 vision 或先验补。

视觉验收还必须检查 typography、layout/density、colors/tokens、assets、copy/content、interaction states 和可见的 accessibility risks；具体归一化和严重度见 `references/qa-checklist.md`。

## Output Layout

目标克隆项目内使用以下结构：

```text
docs/clone-progress.md
docs/source-inventory.md
docs/evidence-gaps.md
docs/page-maps/<state-id>.md
source/screenshots/
source/vision/<state-id>.vision-facts.md
source/probes/source-css-vars.json
source/probes/element-token-map.json
source/probes/shell-tokens.json
source/probes/surface-tokens.json
source/probes/control-tokens.json
source/probes/<state-id>.inventory.json
source/probes/<state-id>.summary.json
source/probes/<state-id>-select-*-open.summary.json
src/styles/tokens.css
qa/screenshots/
qa/iterations/
docs/design-system.md
```

## Script Index

| Script | 用途 |
|---|---|
| `scripts/capture_preflight.sh` | 检查 Chrome/CDP proxy 能力 |
| `scripts/cdp_probe_tokens.mjs` | 采集 source CSS vars、element token map、shell/surface tokens |
| `scripts/cdp_page_inventory.mjs` | 每页 DOM inventory + machine summary + completeness gate |
| `scripts/generate_page_map.mjs` | 从 summary 生成 Page Map 初稿 |
| `scripts/probe_structure.py` | 公开/本地 URL 的结构探针，不用于登录态 |
| `scripts/capture_page.py` | 公开/本地 URL 截图，不用于登录态 |
| `scripts/compare_screenshots.py` | 源/克隆并排 QA 图 |
| `scripts/list_chrome_tabs_macos.py` | 辅助定位 Chrome tab 元数据，不作为访问证据 |

登录态页面优先 Chrome plugin 或 CDP。Playwright/本地脚本是隔离上下文，看不到用户 cookie。

## User Communication

对外不要播报 Phase 编号堆栈，只说明当前在做什么、缺什么、下一步是什么。

| 情况 | 说法 |
|---|---|
| 信息足够 | “我先锁定源页面证据，再实现首版并做截图对比。” |
| 只缺目标源 | 问 1 个问题：“你要我复刻哪个 URL/截图/已打开的 Chrome 页面？” |
| CDP 不可用 | 说明阻塞项 + 一个解锁动作；不要尝试登录态 Playwright |
| 证据不足 | “现在只能做静态还原，不能标高保真通过。” |
| QA 未过 | 给 top 3 差异和下一轮修复，不说完成 |

## Reference Rules

- `references/capture-runbook.md` 是 greenfield canonical workflow。
- `references/incremental-page.md` 是已有项目续作 workflow。
- `references/screenshot-only.md` 是无 DOM 证据时的降级 workflow。
- `references/evidence-trust.md` 负责所有结构争议。
- `references/clone-brief.md` 负责任务边界、最小设计 Brief、来源/资产/内容边界。
- `references/context-budget.md` 只约束聊天上下文，不允许减少磁盘证据。
- templates 只在写对应文档时读取。
