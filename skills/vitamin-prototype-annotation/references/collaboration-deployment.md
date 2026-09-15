# 构建、协作与云端查看

标注能在云端持续查看，依靠文件随原型正常发布，不依赖浏览器临时注入、个人会话或本地缓存。

```text
PRD / 已确认说明 → annotations/*.md + config
                  → 编译 JSON 与 inline JS
                  → 原型构建 → 发布完整静态资源 → 浏览器只读查看
```

## 将编译接入现有工程

安装时使用 `--with-compiler`，将编译器、schema 和资产检查器放入项目 `tools/annotation/`。这样其他开发者和 CI 无须安装作者的 Codex skill。Python 3.9+ 即可运行；不要为运行时增加数据库、服务端接口或鉴权系统。

例如 config 在 `docs/annotations/`，输出配置为 `../../public/annotation-kit/annotation.bundle.json`：

```json
{
  "scripts": {
    "annotations:build": "python3 tools/annotation/compile_annotations.py docs/annotations/annotation.config.json --check-sources",
    "annotations:check": "python3 tools/annotation/check_annotation_assets.py dist/annotation-kit"
  }
}
```

这只是脚本示例，不能覆盖项目原有 scripts。把现有流程串为：标注编译 → 原有业务构建 → 标注产物检查。优先复用既有 prebuild/CI 钩子；已有钩子时保留并组合，不能静默替换。

静态 HTML 项目无需引入前端构建器，直接编译到随页面发布的资源目录。仅能修改 dist 时，每次重建后重新安装/编译，或者推动源工程接入，明确维护方式。

## 需要一起发布的内容

同一个 `annotation-kit/` 目录至少包含：

- `runtime.js`
- `runtime.css`
- `annotation.bundle.json`
- `annotation.bundle.inline.js`
- 内容引用的本地图片、Mermaid 等可选资源

JSON 和 inline JS 同次生成并包含相同 `buildId`。资产检查器会检查必要文件、双格式内容一致性、源 Markdown 是否已内嵌及完整导出数据。先编译成功再发布，使用现有部署的整批/原子发布方式避免混合版本。

源 PRD 和标注 Markdown 不必放在 public；但 bundle 中已经包含标注正文与完整 Markdown。**只读不等于保密**，它继承原型站点的访问边界。只把适合该评审对象看到的内容放入部署包，不添加一套独立标注账号系统。

## 路径与缓存

- 站点根目录、子路径部署、中文文件名和深层路由都要用最终 URL 验证。
- 请求 `annotation.bundle.json` 应返回 JSON，不能被 SPA 回退规则替换成 index.html。
- HTTP 刷新会重新请求 JSON；浏览器已有 inline 对象不会遮盖新版。服务端/CDN仍应为 JSON 配置可重新验证或不缓存策略，发布时按现有流程清缓存。
- 改动运行时 JS/CSS 后通常需要刷新整页；“刷新标注”只更新内容。
- 离线文件刷新重载同目录 inline JS。浏览器策略阻止时会报告失败，可通过本机 HTTP 服务查看。
- 标注不轮询服务器；业务变更后需要完成编译与部署，再由使用者刷新或重新打开页面。

## 发布验证

1. 在最终构建目录执行 `check_annotation_assets.py`，确认资源齐全并且是同一批次。
2. 通过独立静态服务访问该产物，避免开发服务器兜底掩盖缺文件或路径问题。
3. 验证列表/表单等代表性页面：角标、本页与共享规则、隐藏区域、目录、复制/下载和刷新。使用 `VitaminAnnotations.diagnostics()` 检查缺失或歧义目标。
4. 具备实际部署目标和授权时，发布后访问真实 URL，核对 bundle 的 buildId、资源状态和界面交互。对方重新打开页面仍应能查看标注。
5. 没有远端目标时，交付本地构建验证结果与部署命令，明确“远端尚未验证”。

## 协作与更新

更新源 Markdown/config → 重编译 → 审阅 diff → 原有构建/部署 → 刷新页面中的标注。已发布浏览器没有写回源文件的入口。默认依靠项目版本管理；用户明确需要时才额外维护标注 changelog/快照。
