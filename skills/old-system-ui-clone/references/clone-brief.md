# Clone Brief & Source Boundary

在第一次采集前，或恢复已有克隆项目时读取。它借鉴 Product Design 的最小 brief、来源溯源和资产边界规则，但服务于“忠实复刻”，不是视觉探索或改版。

## 最小 Clone Brief

在 `docs/clone-progress.md` 记录下面这些信息；能从用户输入和现有文件确定的内容直接写假设，不要为了填表重复追问。

| Field | 要记录什么 |
|---|---|
| Goal | 要复刻的系统、页面、弹窗或状态 |
| Operator task | 操作员在这个页面要完成什么任务 |
| Source authority | URL、已打开 Tab、截图、现有代码或多种来源的优先级 |
| Route / state | route、默认态、弹窗/下拉/筛选等交互态 |
| Viewport / theme | 浏览器尺寸、主题、登录态、动态内容约束 |
| Scope | 本轮页面范围、复刻深度和交付物 |
| Preserve | 必须保留的结构、密度、文案、资产、交互和旧控件质感 |
| Out of scope | 不做的改版、业务扩展、真实接口或发布动作 |
| Gaps | 当前无法验证的事实，以及准备如何标注 |

如果只缺一个会阻塞执行的信息，只问一个问题。不要把“页面看起来像”当成完整目标；至少要明确 source、state、viewport 和 fidelity target。

## 任务边界

| 用户意图 | 本 Skill 的处理 |
|---|---|
| clone / recreate / match / 还原 / 复刻 | 以源系统为视觉和结构事实源，进入证据链流程 |
| audit / review / 先分析 | 只采集和报告，不因审查自动改代码 |
| improve / better / redesign / 现代化 | 不在复刻流程中擅自改版；先确认是否要忠实还原，或交给 Product Design 改版流程 |

“复刻”不等于“把老页面做得更好看”。如果用户没有明确要求改版，源系统的旧密度、旧控件和不理想但真实的布局都属于待保留事实。

## 来源、资产和内容边界

- 用户指定的 source authority 决定比较对象；结构事实仍按 `evidence-trust.md` 的 CDP、inventory、summary 优先级验证。
- 采集权限不等于公开发布权限。内部页面、客户数据、账号名、订单号、私有 URL、截图和 Logo 不得未经处理写入公共交付物。
- 为了保持页面几何和状态，可以使用稳定的 mock 数据；但要标明替换了真实内容，不要借 mock 数据发明业务规则。
- 对明显可见的 Logo、图标、图片、字体和插画建立资产记录：来源、是否实际采集、替代方案、授权/公开风险和验证状态。
- 无法合法或准确取得的资产要记录为 gap，使用独立替代品并说明差异；不要用 emoji、文字 glyph、随手 CSS 图形或占位方块冒充源资产。

## 交付判断

Clone Brief 只定义目标和边界，不替代截图、DOM probe 或 Design QA。若 source、route、state、viewport 或核心交互无法对齐，交付状态应为 `blocked` 或降级状态，而不是“已完成”。
