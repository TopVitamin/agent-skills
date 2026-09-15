# QA Checklist

Use when implementing a runnable clone, running visual QA, or iterating visual differences — not at skill start.

Context budget: one source + one clone full-page vision pass per iteration; iteration note = top 3 diffs only. See `context-budget.md`.

## Required Evidence

Record:

- source screenshot or source URL
- clone screenshot
- interaction-state screenshot for runnable baselines
- side-by-side or explicit source-vs-clone comparison notes
- source authority, route, state, theme/login state and operator task
- viewport size
- source/implementation pixel size and density when relevant
- page/state
- Interaction Map pass/fail notes
- visible asset list and unresolved asset gaps
- date or iteration label
- unresolved gaps

When Pillow is available, use `scripts/compare_screenshots.py` to create a side-by-side comparison image under `qa/screenshots/`.

## Normalize Before Comparing

先确认 source 和 implementation 是同一个比较对象，再开始判断差异：

- route、页面状态、主题、登录态和动态数据口径一致；
- viewport、crop、scale、pixel density 和 device frame 一致；
- 浏览器 chrome、画布留白、滚动位置和 sticky 状态不混入页面差异；
- source 与 clone 的文字长度、表格数据量和可见控件数量处于可比较状态。

任一条件无法对齐时，结果标记为 `blocked` 或 `verification gap`，不要把不一致直接归因于实现质量。

## Design QA Matrix

每轮至少检查下面七类；全页看构图和密度，局部 crop 看细节：

1. **Typography**：字体/fallback、字号、字重、行高、换行、截断和层级。
2. **Spacing & layout**：区域尺寸、网格、对齐、margin、padding、gap、圆角、描边和阴影。
3. **Colors & tokens**：背景、语义色、透明度、对比度，以及 token 是否来自源证据。
4. **Asset fidelity**：Logo、图标、图片、字体、裁切、比例、清晰度和透明边缘；替代品必须登记。
5. **Copy & content**：文案、数字、顺序、长度、状态和 mock 数据是否与 source 一致。
6. **Interaction & states**：hover、focus、active、selected、loading、empty、error、dropdown、modal 和响应式变化。
7. **Visible accessibility risks**：对比度、焦点、标签、点击区域、键盘可达性和错误提示；截图不能证明完整标准合规，只能记录可见风险。

## Finding Severity

| Severity | 判断 |
|---|---|
| `P0` | 核心任务无法完成、严重布局破坏或严重可访问性风险 |
| `P1` | 主要结构、视觉层级、关键资产或核心交互明显不符 |
| `P2` | 中等视觉漂移、密度/响应式问题或可修复的状态不一致 |
| `P3` | 不阻断验收的细节偏差 |

报告中区分 `confirmed issue`、`likely risk`、`accepted difference` 和 `verification gap`，不要把截图看不清的内容写成确定缺陷。

## Demo Readiness Check

Before starting the first runnable Demo, confirm:

| Gate | Required evidence |
|---|---|
| Shell | dashboard or another full app-shell page |
| List density | representative list page with filters/table/pagination |
| Form/detail | detail, drawer, modal, or create/edit form |
| Interaction | tab/status switch, dropdown/menu/popover, input/filter, row or toolbar action |
| Icons/assets | visible functional icons use verified SVG replacements or are documented as asset gaps |
| Target | source screenshot/live page for the exact Demo page |

If only shell + list are available and the page is not interactive, label the output as static only, not high-fidelity passed and not a complete design-system implementation.

## Visual Comparison Order

| Step | Check | Common fix |
|---|---|---|
| 1 | canvas fit and viewport | adjust shell width/height, overflow, scaling |
| 2 | **surface layering** | gray canvas + white cards; not bordered table on gray |
| 3 | **divider vs grid colors** | dividers `#e8e8e8`; table grid `#ccc`; controls `#d9d9d9` |
| 4 | region hierarchy | remove invented cards/panels or add missing shell regions |
| 5 | top nav and sidebar | **from shell-tokens** — height 64px, menu inline, logo asset |
| 6 | filter/toolbar structure | white page-header strip + bottom divider |
| 7 | table dominance + **column count** | match `summary.tableColumns.length`; thead `#e0e2e8` |
| 8 | pagination/footer | fix anchoring, alignment, density, disabled state |
| 9 | modal/drawer/popover state | verify anchor, edge alignment, width, title, footer |
| 10 | assets/icons | verify logo, icons, image clarity |

If step 2–3 fail, re-run `cdp_probe_tokens.mjs` before pixel-tweaking.

## Interaction Verification Order

| Step | Check | Common fix |
|---|---|---|
| 1 | tab/status switch changes active state | wire active state instead of static classes |
| 2 | tab/status switch changes visible data when reasonable | filter mock rows or update counts/status text |
| 3 | dropdown/menu opens from the correct anchor | position popover relative to trigger, not page center |
| 4 | dropdown/menu closes on selection or outside click | add controlled open state and close handler |
| 5 | text/date input accepts input | use controlled or uncontrolled inputs instead of text-like divs |
| 6 | search/filter produces visible feedback | filter table rows, show chip, toast, or pending note |
| 7 | row/toolbar action exposes menu or feedback | implement menu/popover/toast rather than dead buttons |
| 8 | disabled/loading/empty state is represented or marked pending | add state screenshot or explicit gap |

## Fail Conditions

Mark the clone `not passed` when any of these happen:

- The target source screenshot/live state is missing.
- The implementation combines states that are not visible together in the source.
- A generic admin layout replaces the source structure, such as card stacks where the source is a flat continuous canvas.
- Top nav, sidebar, filter area, or table occupy clearly different regions from the source.
- Filter controls use a different grammar from the source, such as visible labels when the source uses placeholder-only selects.
- A floating panel/dropdown is centered or guessed instead of anchored to the source trigger.
- The first screenshot is only verified for successful rendering, not visual similarity.
- source 与 clone 的 route、viewport、theme 或 state 不一致，却被当成视觉差异。
- The runnable page is non-interactive but is presented as high-fidelity passed.
- Functional icons are left as text/CSS placeholders without recording an asset gap.
- Dropdowns, tabs, inputs, or row actions visible in the source cannot be clicked in the clone.
- Clicking controls changes only styling when the expected source behavior includes visible state/data changes and a reasonable mock state is available.

## Fast QA Loop

For first renders, do not produce a long report. Capture the default clone screenshot and at least one interaction-state screenshot, compare against the source, then list and fix the top 3 visual or interaction differences:

| Rank | Difference | Fix |
|---|---|---|
| 1 | e.g. filters are carded but source is a flat toolbar | remove card wrapper and align toolbar to source y-position |
| 2 | e.g. sidebar lacks verified SVG icons and active block size | add verified SVG icon replacements and match active block height |
| 3 | e.g. dropdown opens in the wrong place or does not open | anchor popover to trigger and verify click state |

## Difference Language

Write visual findings as executable changes:

- Bad: "The table feels off."
- Good: "Table rows are about 6px too tall; reduce row height from 44px to 38px and lower cell font from 14px to 13px."

## Pass Criteria

For a page to count as cloned enough for the next page:

- shared shell proportions match source
- page structure and visible content match source
- core component density matches source
- visible controls in the Interaction Map are clickable
- at least one interaction produces a visible state change for runnable baselines
- functional icons are verified SVG replacements or documented gaps
- no accidental modernization
- no obvious clipping, overlap, or wrong viewport scaling
- no unhandled P0/P1/P2 findings, unless the user explicitly accepts them
- remaining gaps are documented and scoped

## Regression Rule

When adjusting shared components, recheck at least one previously cloned page. Do not improve the current page by breaking earlier pages unless the source evidence proves the shared rule was wrong.
