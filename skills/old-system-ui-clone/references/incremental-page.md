# Incremental Page（已有 design-system 时加新页）

**默认路径：** 项目里已有 `docs/design-system.md` + `shell-tokens.json` + `src/components/form/Legacy*` 时，新页面走本文件，**不要**重跑完整 `capture-runbook.md` Phase 1。

完整 runbook 仅用于：新仓库、换系统、shell/surface 明显变化。

## 进入条件（满足 ≥3 即 incremental）

- [ ] `docs/design-system.md` 存在且 Status ≥ `baseline`
- [ ] `source/probes/shell-tokens.json` + `surface-tokens.json` 存在
- [ ] `src/styles/tokens.css` 与 AppShell 已实现
- [ ] `docs/clone-progress.md` 有 Capture capability（CDP 可用）

## 跳过 vs 仍要做

| 步骤 | 全量 runbook | incremental |
|---|---|---|
| Phase 0 Preflight | ✓ | ✓（快速确认 CDP） |
| Phase 1 shell/surface | ✓ | **跳过**（除非用户说顶栏/侧栏变了） |
| Phase 2 P2.3 inventory | ✓ | ✓ **仅新 state-id** |
| Phase 2 P2.4 控件 open | ✓ | ✓ 该页代表性下拉 + **该页弹窗** |
| Phase 2b Page Map | ✓ | ✓ 仅新页 |
| Phase 3 Implement | ✓ | ✓ 复用 Legacy* / design-system |
| Phase 4 Verify | ✓ | ✓ 源 vs 克隆截图 |
| 沉淀规范 | 全站 gate 后 | 新重复模式才补 design-system 一行 |

## 单页工作流

```text
1. 读 clone-progress.md + design-system.md + 最近 qa/iterations
2. Phase 0：curl :3456/targets，更新 capability
3. 定 state-id（如 sales-list-default）→ 登记 active page
4. 截图 default → cdp_page_inventory.mjs → summary gate PASSED
5. 该页 open 态（下拉 / 弹窗）→ 见下文「弹窗与浮层」
6. docs/page-maps/<state-id>.md + source-inventory 一行
7. 实现：AppShell 不动；页面拼 Legacy*；新弹窗用 LegacyModal
8. qa/iterations/<state-id>-v1.md + 截图对比
9. 更新 clone-progress 用户状态
```

## 实现原则

1. **先读 design-system** — 颜色、栅格、按钮、表格分层不得重发明。
2. **新控件** — 查 `source/probes/control-tokens.json`；无则单页局部样式，跨页重复后再进 `tokens.css`。
3. **列数 === summary.tableColumns.length** — 与全量 runbook 相同硬门槛。
4. **交互** — Interaction Map ≥1 可点；弹窗页 ≥1 打开/关闭/选中。

## 弹窗与浮层

### 何时单独采 state

| 类型 | state-id 模式 | 示例 |
|---|---|---|
| 选择器弹窗 | `<page>-select-<entity>-open` | `buy-add-select-product-open` |
| 抽屉 | `<page>-drawer-<name>-open` | `buy-add-history-drawer-open` |
| 高级搜索 | `<page>-advanced-search-open` | `buy-list-advanced-search-open` |

### 采集步骤（强制）

1. 在 **default 页** CDP `eval` 点击真实触发器（查 DOM class，如 `anticon-usergroup-add`）。
2. `evidence-trust.md` 结构探针 → 确认全宽/双栏、列、footer 按钮。
3. 截图 → `source/screenshots/<state-id>.png`
4. 写入 `source/probes/<state-id>.summary.json`（`generatedBy: cdp-modal-probe`），含：
   - `modal.width/height/maskBg`
   - `tableColumns`
   - `footerButtons`
   - `layout: full-width-table` + `leftSidebar: false`（若证实无左栏）
5. 实现 `*SelectModal.jsx` 或扩展既有 modal；宽度用 `--modal-*-w` token。
6. QA：源/克隆各一张 open 态截图。

### 弹窗 footer 差异（须探针，勿假设）

| 模式 | 行为 |
|---|---|
| 多选 + 确认 | 商品类：底栏「取消 + 确认」+ 已选计数 |
| 单选 + 操作列 | 供应商类：操作列 ✓ 即选并关闭，底栏可能**仅取消** |

## Token 晋升

| 发现 | 动作 |
|---|---|
| 与 design-system 一致 | 不新加 token |
| 新弹窗宽度重复 2+ 次 | `--modal-<name>-w` + design-system §6.9 |
| 一次性页面布局 | 仅 Page Map |

## 用户说法 → incremental

| 用户说 | Agent |
|---|---|
| 做销售列表 / 下一个页面 / 继续克隆 XXX 模块 | incremental 单页流程 |
| 把这个弹窗也做了 | 仅 modal state + 接线 + QA |
| 克隆这个系统（新目录） | 完整 runbook |
| 侧栏改成 220px 了 | 重跑 Phase 1 + 更新 design-system |

## 09-qisemi 项目锚点（示例）

| 资产 | 路径 |
|---|---|
| 规范 | `09-qisemi/docs/design-system.md` |
| 进度 | `09-qisemi/docs/clone-progress.md` |
| Modal 组件 | `09-qisemi/src/components/modal/` |

其他仓库替换为对应 `docs/`、`src/` 路径即可。
