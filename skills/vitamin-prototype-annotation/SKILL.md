---
name: vitamin-prototype-annotation
description: 为既有 HTML、React、Vue 等可访问 DOM 的前端原型添加或更新低侵入业务逻辑标注。从 PRD 提取当前页面规则，以独立 Markdown 编译成只读角标、抽屉和阅读器，并随原型构建部署。适用于原型讲解、研发交接和团队评审。
---

# 原型业务逻辑标注

把业务 PRD 中原型看不出来、但实现或验收需要知道的规则，挂到当前页面的对应区域。保留原型的业务交互、布局和原始 PRD；标注运行时只读，不提供在线编辑、保存或写回接口。

## 核心约定

- **页面优先**：默认只呈现当前路径、当前视图的规则；全模块内容仅在用户主动查看全部页面或下载时呈现。当前页没有任何匹配标注时，运行时默认不显示工具栏与贴边样式（`runtime.hideToolbarWhenEmpty`，默认 `true`）。
- **标注单源**：每个页面或模块只维护一份标注 Markdown，使用块标记提取局部内容。完整下载来自同一份源文档，不另写概览副本。PRD 是业务事实源，标注是派生说明。
- **低侵入**：优先独立静态资源与 HTML/layout 入口；已有选择器足够稳定时直接使用。必要时只补容器级 `data-anno` 和视图标识，不重构组件，不把标注状态绑定进业务状态。
- **事实边界**：只提取来源已确认的业务规则。没有 PRD 时可整理已确认的用户说明或已观察交互；未知的权限、校验、金额、状态与后果写“待确认”，不要根据惯例补齐。
- **正常发布**：源 Markdown → 编译产物 → 原型构建/部署 → 浏览器阅读。页面关闭后文件仍存在；刷新只能读取已编译、已发布的内容，不能直接同步远端未部署的 Markdown。

## 按任务读取

- 提取与裁剪内容前：读 [标注范围](references/annotation-scope.md)。
- 编写 Markdown、配置映射或更新内容时：读 [编写与编译](references/annotation-authoring.md)。
- 首次接入、换技术栈、修复路径或路由时：读 [接入方式](references/integration-patterns.md)。
- 涉及构建、团队使用或云端查看时：读 [构建与发布](references/collaboration-deployment.md)。

不要为了简单增量修改而加载全部参考文档。用户要求或项目现有约定优先于本 skill 的默认表格与呈现偏好。

## 支持范围与环境

编译和安装需要 Python 3.9+ 标准库，无额外 Python 包。浏览器需要现代 JavaScript、DOM 和脚本加载能力；运行时不依赖 React、Vue 或外部 CDN。

- 静态 HTML、普通 DOM 的 SPA：提供通用脚本及可运行示例。
- Vite：可使用 public 资源与 HTML 入口；子路径部署需与项目 base 一致。
- Next/Nuxt/SSR：使用 public 资源和框架原有 layout/head 或客户端挂载入口；按项目实际渲染时机验证，不能只靠 HTML 注入器宣称接入完成。
- 只有构建产物：可接入，但下一次构建会覆盖；必须给出重复接入或源工程集成方式。
- 无法修改源码：可在获得授权的浏览器会话中临时注入做评审；本包不附带浏览器扩展。临时注入不会随云端部署持久存在。
- 截图、Canvas、跨域 iframe、封闭 Shadow DOM 和浏览器原生 top layer（如模态 dialog）不属于现成浮层的直接覆盖范围。先判断是否有可访问的业务容器或轻量适配点，不承诺自动兼容。

## 执行流程

### 1. 探查并判断范围

检查目标工程类型、页面与路由、PRD 位置、已有标注、运行与构建命令、部署输出和 URL 基路径。根据已有 config/runtime 判断初始化或增量更新，不重复询问能够从文件确认的信息。

若多个事实源互相矛盾、缺失信息会改变业务含义，或修复必须扩大用户授权范围，才请求澄清。用户只要诊断时不自动实施。

目录按“用户指定 → 既有标注 → 主 PRD 同级 annotations → 工程根 annotations”选择。多模块 PRD 保留各自目录，可用共同父目录的 `annotation.workspace.json` 聚合；不要为了共享运行时合并源文件。

### 2. 接入或更新

初始化：按技术栈复制资源、注入入口，依据真实 PRD 编写 Markdown 与 config。安装器附带的 `annotation.example.md` 仅是接入演示，实际交付时替换，不把它当业务事实。

增量更新：先对现有 config/workspace 执行 `--check`，记录已有错误。在授权范围内修复影响本次任务的问题；不要因为普通配置错误无条件暂停。按来源定位并原位修改块，新增或删除时同步配置，保留已有稳定 ID 与无关改动。

常规标注只使用 `markdownFile` + `blockId`。内联 `markdown` 仅保留旧版兼容，不作为新文档的第二份内容来源。

### 3. 按页关联

| 内容 | type | 定位与入口 |
| --- | --- | --- |
| 本页准入、模式、保存、离开规则 | `page-global` | 用 `page` 或 `routeMatcher` 定位页面；无路由的多视图再加 `viewScope`。无角标，通过“本页规则”和阅读器查看 |
| 跨页共享且不可归入单页的规则 | `global` | 明确适用路径/视图；通过“本页规则”中的跨页规则及阅读器查看，不放整个模块 PRD |
| 某个界面区域的规则 | `element` | 同上，并配置 `target.selector`；通过数字角标查看 |

稳定内部 ID 不因页面切换重排；显示序号按当前页从 1 开始。列表、新增、详情是示例视图名，可使用项目实际命名。

`routeMatcher` 是 JavaScript 正则，优先于 `page`；未配置路径或 `page: "*"` 表示不限路径。路径条件与 `viewScope` 同时配置时必须同时满足。配置了限定视图却没有 DOM 视图标识时不展示这些块，使用诊断接口排查，不能把所有页面规则混在一起。

### 4. 编译和验证

下列 `<skill-dir>` 是本次读取的 SKILL.md 所在绝对目录；不要假设工作目录恰好是 skill 目录。

```bash
python3 <skill-dir>/scripts/install_annotation_kit.py <project-dir> --inject --with-compiler
python3 <skill-dir>/scripts/compile_annotations.py <config-or-workspace> --check --check-sources
python3 <skill-dir>/scripts/compile_annotations.py <config-or-workspace>
python3 <skill-dir>/scripts/check_annotation_assets.py <built-annotation-kit-dir>
```

`--inject` 面向真实 HTML 入口；SSR 项目省略该参数并按接入说明挂载。已完成项目接入后，构建使用项目内 `tools/annotation/compile_annotations.py`，不依赖作者电脑上的 skill。

编译校验配置结构、重复 ID、Markdown 块结构及需求引用。已声明需求默认必须全部映射；只有明确接受当前范围的缺口时才使用 `--allow-unmapped`。没有稳定需求 ID 时可暂不声明，但必须保留可读来源，不报告“业务覆盖率 100%”。

`--check-sources` 检查本地来源文件是否存在，不判断章节内容是否准确。映射完整、部署资产齐全与页面挂载成功是三种不同验证。

浏览器至少检查：打开角标、本页/跨页规则、全屏目录与下载、刷新、页面切换、隐藏区域展开。确认业务区域尺寸和交互保持原样。刷新失败时保留旧内容并显示失败，不能把旧版本当作最新版本。

运行时诊断（只读）可辅助验证：

```js
await window.VitaminAnnotations.ready;
window.VitaminAnnotations.diagnostics();
await window.VitaminAnnotations.refresh();
window.VitaminAnnotations.sync();
```

诊断中的 `visible` / `readable`、`hidden`、`missing-target`、`missing-view`、`ambiguous`、`out-of-context` 用于区分页面挂载状态，不等于业务需求是否正确。

### 5. 发布并交付

按 [构建与发布](references/collaboration-deployment.md) 将完整标注资源随原型发布。具备已授权部署环境时，检查实际 URL；没有目标服务器时验证本地构建产物并明确尚未验证远端，不制造云端完成记录。

交付说明：影响页面与标注、来源及待确认项、编译与挂载结果、构建/部署方式、实际验证环境。默认不额外创建 changelog 或历史副本；用户需要审查记录时再添加。

## 可运行接入示例

[examples/static](examples/static/) 提供明确标为虚构的业务演示，包含路径不变的列表/新增视图、共享规则和隐藏区域。复制到临时目录后安装与编译，既可通过 HTTP 访问，也可直接打开 HTML。完整命令见接入说明。此示例用于验证工具，不作为其他项目的业务规则来源。
