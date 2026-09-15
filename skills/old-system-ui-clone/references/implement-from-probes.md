# Implement From Probes

Read in **Phase 3** before writing `src/`. **禁止凭截图或 admin 模板猜值。**

## 读取顺序

```text
source-css-vars.json → element-token-map.json → shell-tokens.json → surface-tokens.json → <page>.summary.json → page-map.md → tokens.css → components
```

`source-css-vars.json` 和 `element-token-map.json` 是优先证据：如果关键元素 computed value 命中源站 `--xxx`，`tokens.css` 可以保留源站变量名或映射为本项目语义变量。若源站没有 CSS custom properties，或变量未命中关键元素，回退到 shell/surface probes 的最终渲染值。

## Content and Asset Boundary

实现前先回看 Clone Brief、Page Map 和 source inventory：

- 页面标题、字段、按钮、状态、表格列和 mock 数据从 source 或已确认的项目事实派生；不能用“常见 ERP/WMS 页面”补造结构或业务规则。
- 对 Logo、图标、图片、字体和插画建立 asset ledger。优先使用实际可授权的源资产；无法取得时使用独立替代品，并在 `docs/evidence-gaps.md` 记录来源、差异和后续处理。
- 不用 emoji、文字 glyph、随手 CSS 图形或占位方块替代源页面中承担识别或操作意义的显著资产。
- 交互以 Interaction Map 为准。非核心控件可以标 `pending`，但不能把不可操作的按钮呈现成已完成的高保真交互。

## shell-tokens → 代码

| Probe 字段 | 实现 |
|---|---|
| `sidebar.width` | `--sidebar-w`；`Sidebar` 固定宽 |
| `sidebar.logo` | `background-image` 或 `<img>`，禁止纯文字顶替 |
| `sidebar.menuItemHeight` | 菜单项 `height` |
| `sidebar.menuLayout` | `icon-left-text-inline` → 横排；勿默认竖排 |
| `header.height` | `--header-h`；`TopBar` 固定高 |
| `header.tab*` | Tab 卡片 bg/border/radius/padding |
| `content.paddingLeft` / `margin` | `AppShell` main `margin` / `padding` |

## surface-tokens → tokens.css

| Probe 字段 | CSS 变量 | 用途 |
|---|---|---|
| `canvas.bg` | `--canvas-bg` | 页面灰底 |
| `pageHeader.bg` + `borderBottom` | `--surface-white` + `--divider` | 工具栏白条底边 |
| `card.plain` | `PageCard variant=plain` | 列表表格外壳，**无边框** |
| `card.bordered.border` | `PageCard variant=bordered` | 表单区块 |
| `listTable.theadBg` | `--table-head-bg` | ant 表头填充 |
| `listTable.cellBorder*` | `--table-grid` | 单元格 `#ccc` 右/底 |
| `addTable.vxeHeaderWrapBg` | `--vxe-header-wrap-bg` | VXE 表头行背景 |
| `addTable.vxeGrid` | `--vxe-grid` | VXE 格线 |
| `inputAddon.bg` | `--input-addon-bg` | 输入框后缀「元」「%」 |
| `addTable.footerBar*` | 底栏 `border-top` + `box-shadow` | 保存条 |

**禁止：** 全局只用 `--border: #d9d9d9` 画表格格线（控件边框可用 `#d9d9d9`，格线用 `#ccc`，分割线用 `#e8e8e8`）。

## source-css-vars / element-token-map → tokens.css

| 文件 | 用法 |
|---|---|
| `source-css-vars.json` | 查看 `html` / `body` / theme root 上的源系统 `--xxx`，优先复用品牌色、主题色、全局字号、间距等显式 token |
| `element-token-map.json` | 查看 sidebar、header、tab、table、card 等关键元素 computed style 是否命中某个 `--xxx` |

优先级：

```text
元素 computed style 命中源站变量 → 使用/映射该变量
元素 computed style 未命中变量 → 使用 shell/surface 的最终值
只有变量但没有元素命中 → 记录为候选，不直接晋升全局 token
```

## summary.json → 页面

| 字段 | 实现 |
|---|---|
| `tableColumns[]` | `src/data/<page>Columns.js`，**长度必须相等** |
| `tableColumns[].width` | 列 `minWidth` |
| `tableColumns[].hasSort` | 排序图标占位 |
| `formLabels[]` | 表单字段一个不漏（可标 `pending` 交互） |
| `sectionTitles[]` | 区块标题 + 分割线 |
| `toolbarButtons[]` | 工具栏按钮文案与顺序 |
| `controlSamples[]` | 控件高度/边框/圆角 |

## 页面容器分层（ERP 常见）

```text
灰底 canvas
  └─ 白 page-header（工具栏/标题区，底边 divider）
  └─ 白 card plain（列表表格 + 分页）
  └─ 或：白 card bordered × N（表单各区块）
  └─ 固定底栏（新增/编辑页）
```

不要把表格直接 `border` 在灰底上。

## 数据文件模板

```javascript
// src/data/buyListColumns.js — 从 summary.tableColumns 生成，勿缩短
export const buyListColumns = [
  { key: '...', label: '...', width: 150, hasSort: true },
]
```

## 完成前自检

```bash
# 列数
node -e "const s=require('./source/probes/buy-list-default.summary.json'); console.log(s.tableColumns.length)"
# 与 src/data 列数组 length 对比

# token 文件存在
test -f source/probes/shell-tokens.json && test -f source/probes/surface-tokens.json

# 源站 CSS 变量证据存在（旧项目可缺，新采集应有）
test -f source/probes/source-css-vars.json && test -f source/probes/element-token-map.json
```

## 与 design-system 的边界

Phase 3 只写 `tokens.css` + 页面必要组件。
`docs/design-system.md` 仅在至少 2 个不同页面类型或 3 个同类状态通过 Visual Gate 后，从已验证规则提炼。
