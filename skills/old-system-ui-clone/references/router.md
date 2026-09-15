# Router

用来把用户自然语言和项目现状分流到正确路径。先判断，不确定时只问 1 个关键问题。

Agent owns progress tracking. 用户不需要说 Phase、Mode、`state-id` 或文件路径。

## Task Boundary

先区分用户要的是忠实复刻、体验审查，还是重新设计；同一个页面可以进入不同路径，但不能把它们混成一个目标。

| 用户表述 | 路由 | 处理原则 |
|---|---|---|
| clone / recreate / match / 还原 / 复刻 | 本 Skill | 源页面是视觉和结构事实源，不主动现代化 |
| audit / review / 先看看 / 分析 | evidence-only 或 QA iteration | 先观察和报告；没有修改授权不改代码 |
| improve / better / redesign / 现代化 | Product Design 改版流程 | 可以把本 Skill 的证据作为输入，但不能把改版结果标成忠实复刻 |

如果用户同时说“复刻并优化”，先把两件事拆开：先锁定源系统并完成复刻基线，再另起改版目标和验收标准。

## Inputs To Detect

| 输入 | 说明 |
|---|---|
| URL / 已打开 Chrome 页面 | 可尝试 live/CDP 采集 |
| 截图 / Appshot / 图片 | 只能静态或截图驱动，除非另有 DOM 来源 |
| 目标项目已有 `docs/clone-progress.md` | 优先判断 incremental |
| `docs/page-maps/`、`source/`、`src/`、`qa/` 已存在 | 先从磁盘恢复进度 |
| 用户说“不写代码/先分析” | evidence-only |
| 用户说“继续/下一页/加弹窗” | incremental |
| 用户说“不够像/调像一点” | QA iteration |

## Resume From Artifacts

每次进入已有项目，先静默判断当前位置，再行动。

| 优先级 | Signal | Action |
|---|---|---|
| 1 | `docs/clone-progress.md` exists | read it + latest `qa/iterations/*` |
| 2 | no progress file but artifacts exist | infer state from table below and create `clone-progress.md` |
| 3 | clear user message | user intent overrides inferred state |

| If on disk | Likely state | Next |
|---|---|---|
| only `source/screenshots/` | capture/evidence | build Page Map or ask for missing source |
| `source/vision/` + `docs/page-maps/`, no `src/` | screenshot-only/evidence | implement static or continue evidence |
| `docs/page-maps/` but no `src/` | ready-to-implement | read implementation references |
| `src/` but no `qa/iterations/` | implemented-not-verified | run QA |
| `qa/iterations/*` with `not passed` | iteration | fix top diffs |
| `qa/iterations/*` with `passed` | page complete | next page or design-system |

## Decision Table

| 条件 | 路径 | 必读 |
|---|---|---|
| 新 URL 或新系统，用户要克隆 | greenfield | `capture-runbook.md` |
| 多个 URL，新系统 | greenfield multi-page | `capture-runbook.md`；Phase 1 一次，Phase 2 每页 |
| 已有 `docs/design-system.md` + probes | incremental | `incremental-page.md`, `evidence-trust.md` |
| 只有截图/导出图片 | screenshot-only | `screenshot-only.md` |
| 已有实现，用户要求验收或微调 | QA iteration | `qa-checklist.md` |
| 用户只要分析 | evidence-only | `capture-runbook.md`，停在 Phase 2b |
| 用户说“继续/接着做/上次那个” | resume | 先读 `clone-progress.md`，再按 artifact state 继续 |
| 用户说“先做一页看看像不像” | representative page | 首页走 capture → implement → QA，其余页标 `pending-capture` |
| 用户说“弹窗/高级搜索/选择XX” | modal state | `incremental-page.md`, `evidence-trust.md` |

## One-Question Brief Gate

信息不够时，不要问一串问题。只问当前最阻塞的一个：

| 缺口 | 问题 |
|---|---|
| 没有源目标 | “你要我复刻哪个 URL、截图，还是当前已打开的 Chrome 页面？” |
| 不知道是否写代码 | “这次只采集分析，还是直接做一个可运行首版？” |
| 只有登录态 URL 但无法访问 | “这个页面是否已经在你的 Chrome 里登录并打开？如果是，我会优先走 CDP/Chrome 采集。” |
| 多页面范围不清 | “这次先做一个代表页，还是把你给的所有页面都采集完再实现？” |
| 操作任务或 fidelity target 不清 | “你希望复刻的是哪个操作任务，目标是高保真可交互页面，还是先做静态基线？” |

用户已经明确“直接动手/一次性搭好”时，按可获得证据的最高保真路径执行，不再确认。

Ambiguous resume 时，用一句中文说明判断并继续，例如：

```text
我看上次停在验收阶段，先接着修 top diff。
```

## Handoff Rules

进入路径前，在 `docs/clone-progress.md` 记录：

```markdown
## Active route

| Field | Value |
|---|---|
| Route | greenfield / incremental / screenshot-only / evidence-only / qa-iteration |
| Source | URL / Chrome tab / screenshot / existing project |
| Source authority | 本轮实际作为比较真相的来源 |
| Operator task | 页面需要支持的操作员任务 |
| Route / state | route、默认态和要采集的交互态 |
| Viewport / theme | viewport、主题、登录态和动态内容约束 |
| Preserve | 必须保留的结构、密度、资产、文案和交互 |
| Out of scope | 改版、业务扩展、真实接口、发布等不在本轮范围的内容 |
| Fidelity target | high-fidelity / runnable-baseline / static-only |
| Blocker | none / cdp-unavailable / missing-source |
```

如果目标项目还不存在，先创建最小目录骨架：

```text
docs/page-maps/
source/screenshots/
source/probes/
qa/screenshots/
qa/iterations/
```

## User-Facing Rule

对用户只说当前状态和下一步，不展开内部 Phase。使用源系统实际词汇，不套用示例行业词。

```text
列表页已有一版可运行页面，验收还没过，主要是下拉菜单位置不对。我接着修这个。
```
