# Evidence Trust（反幻觉）

布局与交互的**唯一可信来源**有优先级。违反优先级导致的结构错误（如误加左侧分类栏）视为流程失败。

先在 Clone Brief 中锁定本轮的 source authority；下面的优先级是在该 source authority 内判断结构事实的规则。视觉 QA 仍必须使用锁定的 source state 与同条件下的 clone state，不得把另一个页面或另一种状态混进比较。

## 优先级（高 → 低）

| 优先级 | 来源 | 用于 |
|---|---|---|
| 1 | **CDP `eval`** — `getBoundingClientRect`、`querySelector`、子节点结构 | 有无侧栏、弹窗尺寸、列数、footer 按钮、触发器 class |
| 2 | **`*.summary.json` / `*.inventory.json`**（脚本或带 `probedAt` 的 modal probe） | Page Map、tableColumns、formLabels |
| 3 | **源站截图**（`source/screenshots/`） | 视觉 QA、密度、颜色大致核对 |
| 4 | **克隆截图 / vision 描述** | 仅作对比，**不得**作为实现依据 |
| 5 | **训练先验 / 「常见后台长这样」** | 禁止用于结构决策 |

## 硬规则

| 规则 | 说明 |
|---|---|
| **No vision-only layout** | 未用 CDP 或 inventory 验证前，不得实现侧栏、双栏弹窗、额外表格列、底栏按钮 |
| **Modal before chrome** | 弹窗：先 `click` 触发器 → `eval` 量 `ant-modal` → 再写 `LegacyModal` 子布局 |
| **Negative evidence counts** | CDP 返回 `leftSidebar: false` 或 body 仅 1 个全宽子节点 → 禁止加左栏 |
| **Hand summary ban** | `summary.json` 须来自 `cdp_page_inventory.mjs` 或带 `generatedBy: cdp-modal-probe` 的探针；手写须标注并不得标 `passed` |
| **Correct over invent** | 探针与截图冲突 → 以探针为准，截图记入 QA diff |

## CDP 快速结构探针（弹窗 / 可疑区域）

在 `/eval` 中复用：

```javascript
(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const m = [...document.querySelectorAll('.ant-modal')].filter(vis).pop();
  if (!m) return JSON.stringify({ error: 'no modal' });
  const body = m.querySelector('.ant-modal-body');
  const kids = body ? [...body.children].filter(vis).map(el => ({
    cls: el.className?.toString().slice(0, 80),
    w: Math.round(el.getBoundingClientRect().width),
    h: Math.round(el.getBoundingClientRect().height),
  })) : [];
  return JSON.stringify({
    title: m.querySelector('.ant-modal-title')?.innerText?.trim(),
    bodyChildCount: kids.length,
    bodyChildren: kids,
    hasLeftTree: !!m.querySelector('.ant-tree, [class*="category-tree"], .legacy-modal-tree'),
  });
})()
```

`bodyChildCount === 1` 且 `hasLeftTree === false` → 全宽单栏布局。

## 写入 design-system 的门槛

| 条件 | 可写入全局 token / design-system |
|---|---|
| 同一规则在 ≥2 个 state 出现 | 是 |
| 仅 1 个弹窗/页面见过 | 写在 Page Map 或该 modal 的 `*-open.summary.json`，不进全局 |
| 仅 vision 见过、CDP 未证实 | 否 |

## 纠错记录

实现与源站不符且源于 vision/先验 → 在 `qa/iterations/*.md` 写 **Correction** 段，并回写 probe（`leftSidebar: false` 等），防止下轮重犯。
