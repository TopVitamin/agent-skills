# 接入方式

默认独立资源 + 页面入口；稳定定位不足时才加容器级标识。先看工程，再选择路径，不重构业务组件。

## 1. 静态 HTML

```bash
python3 <skill-dir>/scripts/install_annotation_kit.py <project-dir> --inject --with-compiler
```

默认处理 `index.html`。多页面使用重复的 `--html pages/a.html --html pages/b.html`；参数相对目标工程，嵌套页面的资源相对路径会分别计算。HTML 标签大小写可兼容；重复安装维护 `vpa:assets` 标记块，不重复注入。

脚本输出资源目录，不会代替 agent 编写真实业务标注。编译完成后页面加载：

```html
<link rel="stylesheet" href="./annotation-kit/runtime.css">
<script src="./annotation-kit/annotation.bundle.inline.js"></script>
<script src="./annotation-kit/runtime.js"></script>
```

两个 JS 使用普通 script，按顺序加载，不加 async。HTTP 下运行时始终读取同目录 JSON；`file://` 使用 inline JS。无需手工复制 JSON 内容到页面。

HTTP 刷新以 `no-store` 读取 JSON；`file://` 刷新重新加载 inline JS。失败会保留旧内容并报告失败。普通浏览器刷新也能重新加载资源。

## 2. Vite / React / Vue SPA

使用公共静态目录：

```bash
python3 <skill-dir>/scripts/install_annotation_kit.py <project-dir> --public-path public/annotation-kit --base-href /annotation-kit --inject --with-compiler
```

安装器识别到 Vite/Next/Nuxt 依赖时默认选择 public；不会仅因静态项目有一个 public 文件夹就假定它映射站点根目录。仍应核对实际工程。若部署在 `/demo/`，把 `--base-href` 改成 `/demo/annotation-kit`，并确保框架 base、HTML 资源路径和最终访问 URL 一致。不要因为开发环境根路径可用就跳过部署验证。

`output` 指向公共目录中的 `annotation.bundle.json`。构建会把资源复制到产物，必须检查最终输出，不能只检查 public。

## 3. 路由与无路由多视图

真实路由优先用 `page` 精确匹配，支持原始及 URL 解码后的 pathname，hash 路由可写 `#/orders`。动态路径用 `routeMatcher`（JavaScript 正则）；配置正则时以正则为准，非法表达式不匹配。

无 URL 变化的多视图，需要宿主在既有视图切换处更新一个标识：

```js
document.body.dataset.vpaView = currentView;
window.VitaminAnnotations?.sync();
```

也可把 `data-vpa-view` 放在稳定的活动视图根节点。只保留一个代表当前视图的标识；不要给多个缓存页面都保留相互冲突的标识。

对应 annotation 用 `viewScope: ["list"]`、`["create", "edit"]` 等。未配置或 `[]`、`["*"]` 表示不限视图。路径与视图是 AND 条件。限定视图但找不到标识时显示诊断 `missing-view`。

运行时监听 DOM、滚动、尺寸、hash/popstate，并轻量包装 history 的 pushState/replaceState 触发测量；保留原函数参数、this 和返回值。宿主自定义路由器仍可显式调用 `sync()`。切换上下文关闭旧抽屉/阅读器，避免旧页规则残留。

## 4. SSR / Next / Nuxt

省略 `--inject`，复制 public 资源。沿用项目现有 layout/head 或脚本加载机制挂载 CSS、inline bundle 和 runtime，确保后两者顺序且只加载一次。客户端 DOM 尚未就绪时运行时等待 DOMContentLoaded；后续渲染由 DOM 观察与 `sync()` 跟踪。

框架工具不执行普通 script 字符串时，使用其官方脚本/客户端挂载机制。不要把运行时源文件直接嵌入业务组件。实际使用前核对目标版本的集成方式；本包没有通用的 SSR 自动改写器。

## 5. 选择器与边界

优先：已有 `data-anno` → 稳定 id/testid/语义属性 → 稳定 class。仅在必要时添加：

```jsx
<section data-anno="order-table">...</section>
```

动态区域避免生成的 hash class、`nth-child` 和逐行编号。一个业务区域一个容器定位；多个可见目标会报告 `ambiguous`，应修复选择器，不把任意第一个匹配当可靠挂载。

隐藏、零尺寸、屏幕外或被滚动容器完全裁剪的目标不显示角标；展开后重新测量。需要在其展开态验证。`fallbackSelectors` 可用于兼容不同页面版本，不应用于掩盖含糊的定位。

浮层不改变宿主布局，但会覆盖一部分画面；可切换浮窗或关闭标注。默认抽屉 480px，可配置 `runtime.drawerWidth`，小屏限制在视口内。不承诺任意屏幕都有固定百分比的可操作区域。

当前路径/视图没有任何匹配标注时，运行时默认不渲染工具栏与贴边样式（`runtime.hideToolbarWhenEmpty`，默认 `true`）。需要全站常驻入口时，可在 workspace 顶层设为 `false`。

原生 dialog/popover top layer、iframe 或 Shadow DOM 需要专门验证与适配。无法可靠定位时说明边界，不偷偷改页面结构。

## 6. 可运行示例

把 `<skill-dir>/examples/static` 复制到一个临时目录 `<demo-dir>`：

```bash
python3 <skill-dir>/scripts/install_annotation_kit.py <demo-dir> --inject --with-compiler
python3 <demo-dir>/tools/annotation/compile_annotations.py <demo-dir>/docs/annotations/annotation.config.json --check-sources
python3 <demo-dir>/tools/annotation/check_annotation_assets.py <demo-dir>/annotation-kit
python3 -m http.server 8765 --directory <demo-dir>
```

通过本机 HTTP 地址访问，或直接打开 `<demo-dir>/index.html`。测试标注开关、列表/新增切换、说明弹窗、本页/跨页规则、全屏目录、下载和刷新。修改源 Markdown 后重新编译再点刷新。
