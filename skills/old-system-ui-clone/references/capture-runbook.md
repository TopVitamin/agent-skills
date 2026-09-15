# Capture Runbook（首会话一步到位）

**新克隆项目的默认路径。** 用户给出 URL / 已开 Tab / 截图时，按本文件顺序执行，**不得跳步**。

> **已有 `docs/design-system.md` + shell/surface probes？** 不要走本文件 Phase 1，改读 **`incremental-page.md`**。弹窗布局以 **`evidence-trust.md`**（CDP DOM）为准，不以截图描述为准。

目标：一次会话内完成「可实现的证据包」，避免薄 probes + 猜尺寸 + 过早写代码。

提速边界：**不减少源证据，只减少重复动作**。同一系统内复用 shell/surface probes；Page Map 先由脚本生成初稿；首轮 QA 做全页对比，后续迭代只看 top diff 区域。

开始前先读 `references/clone-brief.md`，在 `docs/clone-progress.md` 记录 source authority、操作员任务、route/state、viewport/theme、必须保留和本轮不做的内容。复刻用户有权访问的源页面，不把采集权限默认为公开发布权限。

如果用户明确说“先采集 / 先分析 / 不写代码”：完成 Phase 0–2b 后停止，不进入 Phase 3。
如果用户说“先做一页看看像不像”：只对首个代表页执行 Phase 2–4，其余页在 `docs/clone-progress.md` 标 `pending-capture`。

## Agent Contract（硬承诺）

| # | 承诺 |
|---|---|
| 1 | 用户给 **N 个页面** → Phase 0–2 对 **全部 N 页** 做完，再进入 Phase 3 写代码；用户明确只先看一页时例外 |
| 2 | 所有 `*.summary.json` **只能**由脚本生成，禁止手写 |
| 3 | `shell-tokens.json` + `surface-tokens.json` 存在且来自 CDP，再写 AppShell / 页面容器；同一系统已有且未变时直接复用 |
| 4 | `tokens.css` 的色值优先参考 `source-css-vars.json` / `element-token-map.json` 的源站变量命中；无命中时来自 `surface-tokens.json`，禁止用一个 `--border` 通吃分割线+表格格线 |
| 5 | 列表页表格列数 **===** `summary.tableColumns.length` |
| 6 | `captureCompleteness.passed === false` 或 implement checklist 未勾完 → **禁止** `npm run dev` 称完成 |

## Phase 总览

```text
Phase 0   Preflight          → capability 写入 clone-progress
Phase 1   App chrome         → source-css-vars + shell-tokens + surface-tokens（全站一次）
Phase 2   Per-page capture   → 每页 P2.1–P2.5（截图 + inventory + 控件 open 态）
Phase 2b  Maps               → generate_page_map 初稿 + interaction-map + source-inventory
Phase 3   Implement          → 仅当 Phase 0–2b 全过
Phase 4   Verify             → 截图对比 + iteration note
```

**Blocker：** 任一 Phase 未过，不得进入下一 Phase。

> **编号说明：** Phase 2 子步骤用 **P2.1–P2.5**；**Phase 2b** 是独立阶段（Maps），不是 P2.2。

---

## Phase 0 — Preflight（<30s）

先完成 Clone Brief，再运行能力检查；若 source、state 或 fidelity target 仍会改变工作路径，只问一个阻塞问题。

```bash
bash scripts/capture_preflight.sh
# 若 Claude Code helper 存在，也可运行:
# node ~/.claude/skills/web-access/scripts/check-deps.mjs
curl -s http://localhost:3456/targets
```

写入 `docs/clone-progress.md` → Capture capability。

- 登录态：`cdp-tab` / `claim-tab` only
- 非 `cdp-tab`/`claim-tab` → 停采集，给用户 **一条** 解锁说明

初始化目录：

```text
docs/ clone-progress.md  page-maps/
source/ screenshots/ probes/
qa/ screenshots/ iterations/
```

---

## Phase 1 — App chrome（全站一次，可缓存）

若目标项目已有 `source/probes/source-css-vars.json`、`source/probes/element-token-map.json`、`source/probes/shell-tokens.json` 和 `source/probes/surface-tokens.json`，且源站侧栏/顶栏/主题没有变化，记录为 reused，不重跑本阶段。旧项目缺前两个文件时，不阻塞 incremental，但下次可进入源站时补跑 Phase 1。

在**任意已登录业务页**执行（列表/表单均可）：

```bash
node scripts/cdp_probe_tokens.mjs \
  --target=TARGET_ID \
  --out source/probes
```

产出：

| 文件 | 内容 |
|---|---|
| `source/probes/source-css-vars.json` | 源站 `html` / `body` / theme root 上显式声明的 `--xxx` CSS custom properties |
| `source/probes/element-token-map.json` | 关键元素 selector/class、computed style，以及与源站 CSS 变量的命中关系 |
| `source/probes/shell-tokens.json` | 侧栏宽高、logo、菜单行高、顶栏 64px、Tab 卡片样式 |
| `source/probes/surface-tokens.json` | 灰底、白卡片、分割线 #e8e8e8、表格格线 #ccc、表头底等 |

**未产出 `shell-tokens.json` + `surface-tokens.json` → 禁止写 `Sidebar.jsx` / `TopBar.jsx` / `tokens.css`。**

`source-css-vars.json` 是优先证据，不是唯一证据：很多老系统使用 Less/Sass 编译后不保留 `--xxx`，或变量挂在 `body` / theme 容器而非 `:root`。实现时先看 `element-token-map.json` 是否证明某个 computed value 命中源站变量；无命中则以 `shell-tokens.json` / `surface-tokens.json` 的最终渲染值为准。

---

## Phase 2 — 每页采集

对用户给的 **每一个 URL / Tab** 重复 P2.1–P2.5：

### P2.1 匹配 Tab 或 `/new`

```bash
curl -s http://localhost:3456/targets   # 优先匹配已有 Tab
# 无匹配 → curl "http://localhost:3456/new?url=ENCODED_URL"
```

### P2.2 默认态截图

```bash
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/x.png"
cp /tmp/x.png source/screenshots/<state-id>-default.png
```

`<state-id>` 从源系统页面名派生，如 `buy-list-default`、`buy-add-default`。

### P2.3 全页 inventory（强制）

```bash
node scripts/cdp_page_inventory.mjs \
  --target=ID \
  --state-id=<state-id> \
  --out source/probes/<state-id>
```

`--out` 是文件前缀，不是目录；脚本会生成 `source/probes/<state-id>.inventory.json` 和 `source/probes/<state-id>.summary.json`。

检查退出码与输出：`Gate: PASSED`。失败则修复后重跑，**不得手写 summary**。

### P2.4 Round-1 控件 open 态（每页 ≥1）

```bash
# eval click 一个代表性下拉 → 再 screenshot
# → source/screenshots/<state-id>-select-<name>-open.png
```

**弹窗/抽屉：** 必须用 CDP 点击真实触发器 → `evidence-trust.md` 结构探针 → 截图 → `<state-id>-open.summary.json`。default inventory **不能**代替弹窗探针。

### P2.5 登记

更新 `docs/source-inventory.md`（每页至少登记：state-id、操作员任务、URL/route、viewport/state、source authority、截图、probe、gate、交互态、资产 gap）。

---

## Phase 2b — Maps（全部页面采完后）

对每一页，读 **仅** `source/probes/<state-id>.summary.json` + 默认截图：

1. 先运行 `scripts/generate_page_map.mjs` 生成 `docs/page-maps/<state-id>.md` 初稿
2. 校正 Page Map：含 Structure Map、**全部** tableColumns、formLabels、sectionTitles
3. Interaction Map 嵌入 Page Map 或独立文件
4. `docs/clone-progress.md` — Capture completeness 表每行 `passed`

```bash
node scripts/generate_page_map.mjs \
  source/probes/<state-id>.summary.json \
  docs/page-maps/<state-id>.md
```

---

## Phase 3 — Implement（门槛）

如果用户只要求采集/分析，到这里停止；不要创建或修改 `src/`。

开始前必读：

| 顺序 | 文件 |
|---|---|
| 1 | `references/implement-from-probes.md` |
| 2 | `source/probes/source-css-vars.json` + `source/probes/element-token-map.json`（旧项目可缺，新采集应有） |
| 3 | `source/probes/shell-tokens.json` |
| 4 | `source/probes/surface-tokens.json` |
| 5 | 各页 `*.summary.json` + `docs/page-maps/*.md` |
| 6 | `references/react-vite-tailwind.md` |

Implement checklist（全勾才允许称 baseline）：

- [ ] `src/styles/tokens.css` 优先映射源站 CSS 变量命中；无命中时映射 shell + surface 全部关键 token
- [ ] AppShell 尺寸来自 shell-tokens，非猜测
- [ ] 列表：白 **card** 包表（plain），工具栏白条 + `#e8e8e8` 底边
- [ ] 表格：列数一致；thead `#e0e2e8`；格线 `#ccc`
- [ ] 表单：区块 `bordered` card `#e8e8e8`；底栏固定白条
- [ ] 每页 Interaction Map 最少 1 个可点控件已实现
- [ ] 页面文案、mock 数据、资产和可见状态来自 source 或已登记 gap；未观察到的业务规则没有被补造
- [ ] 主要交互按 Interaction Map 实现；无法实现的控件有 pending 或 blocker，而不是假装完成
- [ ] `npm run build` 通过

---

## Phase 4 — Verify

```bash
npm run dev
# CDP 截图 clone @ 与源站相同 viewport（通常 1920×1080 或源 probe 记录的尺寸）
```

- 比较前：对齐 route、viewport、crop/scale、theme、登录态、动态内容、浏览器外壳和交互 state
- 首轮：源 + 克隆各 1 张全页 vision 对比，并按 typography、layout/density、colors/tokens、assets、copy/content、interaction states、可见 accessibility risks 检查
- 后续迭代：复用源截图，优先截 top 3 差异区域 crop；结构性错误才重做全页
- `qa/iterations/<state-id>-v1.md`：top 3 diffs + pass/not passed
- P0/P1/P2 未处理或未被用户明确接受 → 不得声称「已完成克隆」

---

## 多页用户请求示例

用户：「克隆进货列表 + 新增进货单」

```text
✓ Phase 1 一次
✓ Phase 2 buy-list-default（P2.1–P2.5）
✓ Phase 2 buy-add-default（P2.1–P2.5）
✓ Phase 2b 两页 Page Map
✓ Phase 3 先 shell → 列表页 → 新增页（或 shell 后并行）
✓ Phase 4 每页至少一轮验收
```

**错误做法：** 只采列表 → 立刻写列表 → 用户提醒才采新增。

用户：「先做一页看看像不像」

```text
✓ Phase 1 一次
✓ Phase 2 仅首个代表页
✓ Phase 2b 首页 Page Map
✓ Phase 3–4 首页 baseline + QA
✗ 其余页面不得声称已采集或已完成；clone-progress 标 pending-capture
```

---

## 禁止捷径（见一次纠一次）

| 禁止 | 应做 |
|---|---|
| 手写 40 行 summary | `cdp_page_inventory.mjs` |
| 跳过 shell/surface probe | `cdp_probe_tokens.mjs` |
| 灰底上直接 bordered table | 白 card + 正确格线色 |
| 表头 `#fafafa` 默认值 | 用 surface-tokens `tableHeadBg` |
| 侧栏图标上文字下 | 读 shell-tokens `menuLayout` |
| gate 未过就交差 | iteration note 标 not passed |
| 凭 vision/先验加左栏、双栏弹窗 | CDP 探针 `leftSidebar: false` 或 body 单子节点 |
| 每加一页就重跑 shell probe | incremental 跳过 Phase 1 |

---

## 脚本索引

| 脚本 | 何时 |
|---|---|
| `cdp_probe_tokens.mjs` | Phase 1，每应用一次 |
| `cdp_page_inventory.mjs` | Phase 2 P2.3，每页 |
| `generate_page_map.mjs` | Phase 2b，从 summary 生成 Page Map 初稿 |
| `probe_structure.py` | 公开 URL / 本地 HTML（非登录态） |
| `capture_page.py` | 公开 URL Playwright 截图（非登录态） |
| `compare_screenshots.py` | Phase 4 可选 |

Pair: `capture-completeness.md`（字段门槛）、`implement-from-probes.md`（代码映射）。
