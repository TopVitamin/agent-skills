# 编写与编译

业务 PRD 是事实源；标注 Markdown 是页面说明源；JSON/inline JS 是构建产物。修改内容后必须重编译，不能只改 bundle。

## 文件与路径

推荐在 PRD 同级 `annotations/` 放 Markdown 和 config；用户指定路径或既有目录优先。

- `sourceBase` 相对 **config 所在目录**，默认 `.`。
- `markdownFile` 相对 `sourceBase`，不能逃出该源目录；需要更宽源范围时显式调整 `sourceBase`。
- 需求的 `source` 也相对 `sourceBase`，允许指向父目录 PRD；`#章节` 是可读定位信息。
- config/workspace 的 `output`、`coverage`、`htmlOutput` 相对 **该配置文件目录**。
- CLI 中的路径参数相对当前 shell 目录。
- 运行时包固定放在 `runtime.js` 旁：`annotation.bundle.json` 与 `annotation.bundle.inline.js`。自定义输出目录可以，但部署时保持这两个文件名。

例如：

```text
project/
  index.html
  docs/prd.md
  docs/annotations/page.md
  docs/annotations/annotation.config.json
  annotation-kit/                  # 静态页输出；Vite 通常是 public/annotation-kit
  tools/annotation/                # 可选的项目内编译器，供构建使用
```

## 单源示例

下面是语法示例，不是可直接套用到业务的需求：

```markdown
# 当前页面业务说明

> 来源：../prd.md#当前页面；未确认内容应明确标记。

<!-- anno:start id=page-rules -->
## 本页规则

### 页面模式
- 这里仅填写 PRD 已确认的页级规则。
<!-- anno:end id=page-rules -->

<!-- anno:start id=filter -->
## 筛选区域

> 来源：../prd.md#查询规则

### 查询语义
- 这里仅填写来源明确的筛选与重置行为。
<!-- anno:end id=filter -->
```

每个块必须完整闭合；ID 在同一文件内不能重复，不允许嵌套。旧式 `<!-- anno:id=filter -->` 可读到下一个标记或文件末尾，新内容使用 start/end。

注释中的额外 `page`、`target` 字段仅作为可读提示；编译映射以 config 为准，不会自动读取这些提示。所有需要在页面展示的规则都必须位于已配置块内；块外引言保留在完整下载中。

对应 config：

```json
{
  "version": 1,
  "scope": "orders",
  "sourceBase": ".",
  "output": "../../annotation-kit/annotation.bundle.json",
  "coverage": "coverage.md",
  "sourceRequirements": [
    {"id": "REQ-QUERY", "source": "../prd.md#查询规则", "page": "/orders"}
  ],
  "annotations": [
    {"id": "page-rules", "type": "page-global", "page": "/orders", "moduleName": "本页规则", "markdownFile": "page.md"},
    {"id": "filter", "type": "element", "page": "/orders", "moduleName": "筛选区域", "target": {"selector": "[data-anno='order-filter']"}, "markdownFile": "page.md", "sourceRefs": ["REQ-QUERY"]}
  ]
}
```

`blockId` 默认等于 `id`。无路由多视图原型可改用 `page: "*"`，并在块上配置 `viewScope`。`page-global` 可以只用真实路径限定，不强制额外建立 SPA 视图。

## 映射与增量更新

使用项目已有需求 ID；没有 ID 时可在 config 中建立稳定映射，无须修改 PRD。`sourceRefs` 引用的是同一模块 `sourceRequirements` 中的 ID。

映射完整只代表声明的 ID 被引用。编译器不理解 PRD 语义，也不访问 DOM。`--check-sources` 只检查本地来源文件存在；外部 URL 和章节准确性由实际阅读确认。

更新规则时修改原块，保持 ID 稳定；删除块同步删除配置与不再适用的需求映射。先修复范围内的存量错误，再重编译并检查受影响页面。旧 config 的内联 `markdown` 保持兼容，但新写内容统一从文件提取。

## 多模块聚合

工作区 `inputs` 分别指定 config、唯一 `scope` 和可选 `order`。运行时 Key 为 `scope:id`，允许不同模块复用局部 ID，也允许不同模块拥有自己的跨页规则。使用明确的路径/视图范围，避免不相关共享规则出现在同一页面。

`runtime` 和 `mermaid` 设置以 **workspace 顶层**为准，不自动合并各模块配置。源文件顺序与模块 order 决定完整导出顺序；运行时保留模块顺序。

## Markdown 与附图

支持常用标题、段落、列表、表格、代码块、引用、链接、图片和可选 Mermaid；这是轻量渲染器，不承诺完整 CommonMark/MDX。表格中的字面管道写 `\|`，不依赖原始 HTML 布局。

链接和图片的相对路径按 **部署后的 bundle 目录**解析，不按源 Markdown 所在目录。将必要图片放入可发布静态资源并使用对应路径；不要把源码目录的本地绝对路径带到云端。

Mermaid 仅在配置 `mermaid.src` 或宿主已有 `window.mermaid` 时绘图；否则显示源码。无默认外网依赖。优先本地资源，不重置宿主已有 Mermaid 配置；单独 HTML 导出默认保留 Mermaid 源码。

完整 Markdown 下载保留原文件引言、块标记和块外说明，多文件按编译顺序合并；它是阅读与归档导出，不是包含目录和附件的完整工程备份。
